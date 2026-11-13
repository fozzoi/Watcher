import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { getSavedItems, addSavedItem, removeSavedItem, clearSavedItems, setCloudOnlyMode, SavedItemsMutation, setOnSavedItemsChangedListener } from './database';
import { GLOBAL_CONFIG, setGlobalConfig } from './tmdb';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';
let applyingRemoteChanges = false;
let cloudMutationQueuePaused = false;
let outboxLock: Promise<unknown> = Promise.resolve();
let inFlightFlushPromise: Promise<FlushResult> | null = null;
let inFlightPollPromise: Promise<PollResult> | null = null;
let inFlightOperationId: string | null = null;
let initialMergeInFlight = false;
let retryDelay = 1000;
let retryAfter = 0;
let lastPollAt = 0;

const outboxKey = (userId: string) => `cloud_sync_outbox_v1:${userId}`;
const snapshotCacheKey = (userId: string) => `cloud_library_snapshot_v1:${userId}`;
const revisionRepairKey = (userId: string) => `cloud_sync_revision_repaired_v1:${userId}`;

type FlushResult = { flushed: boolean; remaining: number; error?: string };
type PollResult = { ok: boolean; updated?: boolean; error?: string };

function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = outboxLock.then(fn, fn);
  outboxLock = run.catch(() => undefined);
  return run;
}

async function readOutboxRaw(userId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(outboxKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeOutboxRaw(userId: string, outbox: any[]): Promise<void> {
  await AsyncStorage.setItem(outboxKey(userId), JSON.stringify(outbox));
}

function mergeWatchProgressMaps(localProg: Record<string, any>, remoteProg: Record<string, any>) {
  const merged = { ...(localProg || {}) };
  for (const [k, v] of Object.entries(remoteProg || {})) {
    if (!v || typeof v !== 'object') continue;
    const localVal = merged[k];
    const rTime = Number((v as any).updatedAt || (v as any).timestamp || 0);
    const lTime = Number(localVal?.updatedAt || localVal?.timestamp || 0);
    if (!localVal || rTime >= lTime) {
      merged[k] = v;
    }
  }
  return merged;
}

function removeWatchProgressEntries(localProg: Record<string, any>, mediaId: number) {
  const next = { ...(localProg || {}) };
  const targetId = Number(mediaId);
  const idPrefix = String(targetId);
  for (const [key, val] of Object.entries(next)) {
    if (
      key === idPrefix ||
      key.startsWith(`movie:${idPrefix}`) ||
      key.startsWith(`tv:${idPrefix}:`) ||
      Number((val as any)?.tmdbId) === targetId
    ) {
      delete next[key];
    }
  }
  return next;
}

async function writeSnapshotCache(library: any, userId?: string) {
  const owner = userId ? { userId } : await cloudSync.getAuthUser();
  if (!owner?.userId) return;
  const snapshot = {
    watchlist: Array.isArray(library?.watchlist) ? library.watchlist : [],
    history: Array.isArray(library?.history) ? library.history : [],
    favoriteArtists: Array.isArray(library?.favoriteArtists) ? library.favoriteArtists : [],
    preferences: library?.preferences && typeof library.preferences === 'object' ? library.preferences : {},
  };
  await AsyncStorage.setItem(snapshotCacheKey(owner.userId), JSON.stringify(snapshot));
}

async function persistCurrentSnapshotCache(userId?: string) {
  try {
    await writeSnapshotCache({
      watchlist: getSavedItems('watchlist'),
      history: getSavedItems('history'),
      favoriteArtists: getSavedItems('artist'),
      preferences: { nsfwFilterEnabled: GLOBAL_CONFIG.nsfwFilterEnabled },
    }, userId);
  } catch (error) {
    console.warn('Could not persist snapshot cache:', error);
  }
}

async function applyNsfwPreference(value: unknown) {
  if (typeof value !== 'boolean') return;
  await AsyncStorage.setItem('settings_nsfw', JSON.stringify(value));
  setGlobalConfig('nsfwFilterEnabled', value);
  DeviceEventEmitter.emit('watcher_nsfw_setting_changed', value);
}

async function readSnapshotCache(userId: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(snapshotCacheKey(userId));
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !Array.isArray(cached.watchlist) || !Array.isArray(cached.history) || !Array.isArray(cached.favoriteArtists)) return null;
    return cached;
  } catch { return null; }
}

async function handleExpiredSession() {
  const user = await cloudSync.getAuthUser();
  // Restore in-memory cloud library to SQLite first so nothing is lost locally.
  setCloudOnlyMode(false);
  if (user?.userId) {
    await AsyncStorage.setItem('cloud_local_library_owner', user.userId);
  }
  await Promise.all([
    AsyncStorage.removeItem('cloud_auth_token'),
    AsyncStorage.removeItem('cloud_auth_user'),
    AsyncStorage.removeItem('last_cloud_sync_time'),
  ]);
  retryAfter = 0;
  retryDelay = 1000;
  DeviceEventEmitter.emit('watcher_cloud_auth_changed', null);
}

async function prepareLocalLibraryForAccount(userId: string) {
  const owner = await AsyncStorage.getItem('cloud_local_library_owner');
  if (owner && owner !== userId) {
    applyingRemoteChanges = true;
    try {
      setCloudOnlyMode(false);
      clearSavedItems('watchlist', false);
      clearSavedItems('history', false);
      clearSavedItems('artist', false);
      for (const key of [
        'savedCollections',
        '@watch_progress',
        'watch_progress_v1',
        'watcher.chat.conversations.v1',
        'watcher.chat.userMemory.v1',
        'watcher.chat.aiName.v1',
      ]) {
        await AsyncStorage.removeItem(key);
      }
      await AsyncStorage.removeItem('cloud_sync_revision');
    } finally { applyingRemoteChanges = false; }
  }
  await AsyncStorage.setItem('cloud_local_library_owner', userId);
}

async function enqueueCloudOperation(operation: any): Promise<void> {
  try {
    const user = await cloudSync.getAuthUser();
    if (!user) return;
    await withOutboxLock(async () => {
      const outbox = await readOutboxRaw(user.userId);
      const nextOp = { ...operation, operationId: Crypto.randomUUID(), clientTimestamp: Date.now() };

      // Coalesce pending non-in-flight watchProgress/preferences set operations so
      // playback ticks never flood the outbox or hit server rate limits.
      if (nextOp.action === 'set' && (nextOp.type === 'watchProgress' || nextOp.type === 'preferences')) {
        const idx = outbox.findIndex(
          (op: any) =>
            op &&
            op.type === nextOp.type &&
            op.action === 'set' &&
            op.operationId !== inFlightOperationId
        );
        if (idx >= 0) {
          const prev = outbox[idx];
          const mergedValue = nextOp.type === 'watchProgress'
            ? mergeWatchProgressMaps(prev.value || {}, nextOp.value || {})
            : { ...(prev.value || {}), ...(nextOp.value || {}) };
          outbox[idx] = {
            ...nextOp,
            value: mergedValue,
          };
          await writeOutboxRaw(user.userId, outbox);
          await persistCurrentSnapshotCache(user.userId);
          return;
        }
      }

      outbox.push(nextOp);
      await writeOutboxRaw(user.userId, outbox);
      await persistCurrentSnapshotCache(user.userId);
    });
    void flushCloudOutbox();
  } catch (error: any) {
    console.warn('Could not queue cloud edit:', error?.message);
  }
}

export async function flushCloudOutbox(options?: { ignoreBackoff?: boolean }): Promise<FlushResult> {
  if (inFlightFlushPromise) {
    return inFlightFlushPromise;
  }
  const ignoreBackoff = options?.ignoreBackoff === true;
  if (!ignoreBackoff && Date.now() < retryAfter) {
    const user = await cloudSync.getAuthUser();
    const remaining = user ? (await readOutboxRaw(user.userId)).length : 0;
    return { flushed: remaining === 0, remaining };
  }

  const run = (async (): Promise<FlushResult> => {
    const [user, token] = await Promise.all([cloudSync.getAuthUser(), cloudSync.getAuthToken()]);
    if (!user || !token) return { flushed: false, remaining: 0, error: 'Not signed in' };

    let lastError: string | undefined;
    try {
      while (true) {
        const operation = await withOutboxLock(async () => {
          const outbox = await readOutboxRaw(user.userId);
          // Immediately purge unsupported/poison-pill mutations (such as tasteTelemetry)
          const sanitizedOutbox = outbox.filter((op: any) => op && op.type && op.type !== 'tasteTelemetry');
          if (sanitizedOutbox.length !== outbox.length) {
            await writeOutboxRaw(user.userId, sanitizedOutbox);
          }
          return sanitizedOutbox[0] || null;
        });

        if (!operation) {
          retryAfter = 0;
          retryDelay = 1000;
          return { flushed: true, remaining: 0 };
        }

        inFlightOperationId = operation.operationId;
        try {
          const isSnapshotMerge = operation.type === 'librarySnapshotMerge' && operation.action === 'merge';
          const requestBody = isSnapshotMerge
            ? { ...(operation.value || {}), mode: 'merge' }
            : { action: 'mutate', mutation: operation };
          const response = await axios.post(`${AUTH_API_BASE}/api/sync`, requestBody, {
            headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
          });
          await withOutboxLock(async () => {
            const current = await readOutboxRaw(user.userId);
            const next = current.filter((op: any) => op?.operationId !== operation.operationId);
            await writeOutboxRaw(user.userId, next);
          });

          // Keep the last applied revision unchanged. This mutation's revision may
          // follow edits from another device, and jumping to it would skip those
          // deltas (including server side effects such as history removing watchlist items).

          retryAfter = 0;
          retryDelay = 1000;
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 400) {
            console.warn('Dropping invalid cloud mutation from queue:', operation?.type, error?.response?.data);
            await withOutboxLock(async () => {
              const current = await readOutboxRaw(user.userId);
              const next = current.filter((op: any) => op?.operationId !== operation.operationId);
              await writeOutboxRaw(user.userId, next);
            });
            continue;
          }
          if (status === 401) {
            await handleExpiredSession();
            return { flushed: false, remaining: 0, error: 'Session expired. Please sign in again.' };
          }
          retryAfter = Date.now() + retryDelay;
          retryDelay = Math.min(30000, retryDelay * 2);
          lastError = error?.response?.data?.error || error.message || 'Cloud sync failed';
          console.warn('Cloud edit saved for retry:', error?.response?.data || error.message);
          const remaining = await withOutboxLock(async () => (await readOutboxRaw(user.userId)).length);
          return { flushed: false, remaining, error: lastError };
        } finally {
          inFlightOperationId = null;
        }
      }
    } finally {
      inFlightOperationId = null;
      await persistCurrentSnapshotCache(user.userId);
    }
  })();

  inFlightFlushPromise = run;
  try {
    return await run;
  } finally {
    if (inFlightFlushPromise === run) inFlightFlushPromise = null;
  }
}

const apiType = (type: SavedItemsMutation['type']) => type === 'artist' ? 'favoriteArtists' : type;

export const queueCloudMutation = (mutation: SavedItemsMutation) => {
  if (applyingRemoteChanges || cloudMutationQueuePaused) return;
  void enqueueCloudOperation({ ...mutation, type: apiType(mutation.type) });
};

export async function withCloudMutationQueuePaused<T>(fn: () => Promise<T> | T): Promise<T> {
  const wasPaused = cloudMutationQueuePaused;
  cloudMutationQueuePaused = true;
  try {
    return await fn();
  } finally {
    cloudMutationQueuePaused = wasPaused;
  }
}

async function readJsonStorage<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

/** Persist a full-library merge as one durable outbox operation for backup restore. */
export async function queueCloudLibrarySnapshotMerge(): Promise<FlushResult> {
  const user = await cloudSync.getAuthUser();
  if (!user) return { flushed: true, remaining: 0 };

  const [watchProgress, savedCollections, nsfwFilter, conversations, userMemory, aiName] = await Promise.all([
    readJsonStorage<Record<string, any>>('@watch_progress', await readJsonStorage('watch_progress_v1', {})),
    readJsonStorage<any[]>('savedCollections', []),
    readJsonStorage<boolean>('settings_nsfw', GLOBAL_CONFIG.nsfwFilterEnabled),
    readJsonStorage<any[]>('watcher.chat.conversations.v1', []),
    AsyncStorage.getItem('watcher.chat.userMemory.v1'),
    AsyncStorage.getItem('watcher.chat.aiName.v1'),
  ]);
  const payload = {
    watchlist: getSavedItems('watchlist'),
    history: getSavedItems('history'),
    favoriteArtists: getSavedItems('artist'),
    savedCollections: Array.isArray(savedCollections) ? savedCollections : [],
    watchProgress: watchProgress && typeof watchProgress === 'object' ? watchProgress : {},
    preferences: { nsfwFilterEnabled: typeof nsfwFilter === 'boolean' ? nsfwFilter : GLOBAL_CONFIG.nsfwFilterEnabled },
    aiChatData: {
      conversations: Array.isArray(conversations) ? conversations : [],
      userMemory: userMemory || '',
      aiName: aiName || 'Cine',
    },
  };

  await enqueueCloudOperation({ type: 'librarySnapshotMerge', action: 'merge', value: payload });
  await waitForPendingOutboxWrites();
  return flushCloudOutbox({ ignoreBackoff: true });
}

// Permanently wire database mutations to cloud sync queue
setOnSavedItemsChangedListener(queueCloudMutation);

export const queueCloudValue = (type: 'preferences' | 'watchProgress', value: any) => {
  if (applyingRemoteChanges) return;
  void enqueueCloudOperation({ type, action: 'set', value });
};

export const queueCloudProgressRemoval = (mediaId: number) => {
  if (applyingRemoteChanges || !Number.isFinite(Number(mediaId))) return;
  void enqueueCloudOperation({ type: 'watchProgress', action: 'remove', mediaId: Number(mediaId) });
};

export async function waitForPendingOutboxWrites(): Promise<void> {
  await outboxLock;
}

async function applyCloudLibrary(library: any, revision: number) {
  setCloudOnlyMode(true, library);
  await applyNsfwPreference(library?.preferences?.nsfwFilterEnabled);
  if (library?.watchProgress && typeof library.watchProgress === 'object') {
    const localRaw = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
    const localProg = localRaw ? JSON.parse(localRaw) : {};
    const mergedProg = mergeWatchProgressMaps(localProg, library.watchProgress);
    const progJson = JSON.stringify(mergedProg);
    await AsyncStorage.setItem('@watch_progress', progJson);
    await AsyncStorage.setItem('watch_progress_v1', progJson);
    DeviceEventEmitter.emit('watcher_watch_progress_changed', mergedProg);
  } else {
    const emptyJson = JSON.stringify({});
    await AsyncStorage.setItem('@watch_progress', emptyJson);
    await AsyncStorage.setItem('watch_progress_v1', emptyJson);
    DeviceEventEmitter.emit('watcher_watch_progress_changed', {});
  }
  await AsyncStorage.setItem('savedCollections', JSON.stringify(Array.isArray(library?.savedCollections) ? library.savedCollections : []));
  const chat = library?.aiChatData;
  await AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(Array.isArray(chat?.conversations) ? chat.conversations : []));
  await AsyncStorage.setItem('watcher.chat.userMemory.v1', typeof chat?.userMemory === 'string' ? chat.userMemory : '');
  await AsyncStorage.setItem('watcher.chat.aiName.v1', typeof chat?.aiName === 'string' ? chat.aiName : 'Cine');
  await AsyncStorage.setItem('cloud_sync_revision', String(revision));
  await writeSnapshotCache(library);
}

export async function prepareCloudSessionOnStartup(): Promise<void> {
  const [token, user] = await Promise.all([cloudSync.getAuthToken(), cloudSync.getAuthUser()]);
  if (!token || !user) return;
  const cachedLibrary = await readSnapshotCache(user.userId);
  if (cachedLibrary) {
    setCloudOnlyMode(true, cachedLibrary);
    await applyNsfwPreference(cachedLibrary.preferences?.nsfwFilterEnabled);
  }

  await pollCloudChanges();
}

async function pollCloudChangesWithResult(options?: { ignoreBackoff?: boolean }): Promise<PollResult> {
  if (initialMergeInFlight) return { ok: false, error: 'Initial library merge is already running' };
  if (inFlightPollPromise) return inFlightPollPromise;

  const run = (async (): Promise<PollResult> => {
    try {
      const [token, user] = await Promise.all([cloudSync.getAuthToken(), cloudSync.getAuthUser()]);
      if (!token || !user) return { ok: false, error: 'Sign in to sync your library' };

      // Ensure pending local mutations are serialized and flushed before pulling
      // remote state so snapshots never clobber unsynced local edits.
      await waitForPendingOutboxWrites();
      const flushResult = await flushCloudOutbox({ ignoreBackoff: options?.ignoreBackoff });
      if (!flushResult.flushed || flushResult.remaining > 0) {
        return { ok: false, error: flushResult.error || 'Could not upload local edits yet' };
      }

      // Earlier clients advanced this checkpoint on upload and could skip edits
      // from other devices. Rebuild this account's local view once from the cloud.
      const repairKey = revisionRepairKey(user.userId);
      if (await AsyncStorage.getItem(repairKey) === null) {
        await AsyncStorage.removeItem('cloud_sync_revision');
        await AsyncStorage.setItem(repairKey, 'true');
      }

      const savedRevision = await AsyncStorage.getItem('cloud_sync_revision');
      if (savedRevision === null) {
        setCloudOnlyMode(true);
        const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
        if (snapshot.data?.library) {
          await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || 0));
          lastPollAt = Date.now();
          return { ok: true, updated: true };
        }
        return { ok: false, error: 'Cloud response did not include a library' };
      }

      const revision = Number(savedRevision || 0);
      const response = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${revision}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
      });
      const nextRevision = Number(response.data?.revision || 0);
      if (!nextRevision || nextRevision <= revision) {
        lastPollAt = Date.now();
        return { ok: true, updated: false };
      }

      const changes = response.data?.changes;
      const completeDelta = Array.isArray(changes) && changes.length > 0 &&
        changes.length === nextRevision - revision &&
        changes.every((change: any, index: number) =>
          change.revision === revision + index + 1 &&
          change.action !== 'snapshot' &&
          (
            (['watchlist', 'history', 'favoriteArtists', 'savedCollections'].includes(change.type) && ['add', 'remove', 'clear'].includes(change.action)) ||
            (change.type === 'watchProgress' && ['set', 'remove'].includes(change.action)) ||
            (change.type === 'preferences' && change.action === 'set')
          )
        );
      if (response.data?.status === 'delta' && completeDelta) {
        applyingRemoteChanges = true;
        try {
          let savedCollections: any[] | null = null;
          for (const change of changes) {
            if (change.type === 'savedCollections') {
              if (savedCollections === null) {
                const raw = await AsyncStorage.getItem('savedCollections');
                try { savedCollections = raw ? JSON.parse(raw) : []; } catch { savedCollections = []; }
                if (!Array.isArray(savedCollections)) savedCollections = [];
              }
              if (change.action === 'clear') savedCollections = [];
              else if (change.action === 'remove') {
                savedCollections = savedCollections.filter((item: any) => Number(item?.id ?? item?.media_id) !== Number(change.mediaId));
              } else if (change.action === 'add' && change.item) {
                savedCollections = [change.item, ...savedCollections.filter((item: any) => Number(item?.id ?? item?.media_id) !== Number(change.item.id))];
              }
              continue;
            }
            const type = (change.type === 'favoriteArtists' ? 'artist' : change.type) as 'watchlist' | 'history' | 'artist';
            if (!['watchlist', 'history', 'artist'].includes(type)) continue;
            if (change.action === 'clear') clearSavedItems(type);
            else if (change.action === 'remove') removeSavedItem(Number(change.mediaId), type, type === 'artist' ? undefined : change.mediaType);
            else if (change.action === 'add' && change.item) {
              addSavedItem(change.item, type);
              if (type === 'history' && change.removesMatchingWatchlistItem) {
                const mediaType = change.item.media_type === 'tv'
                  ? 'tv'
                  : change.item.media_type === 'collection'
                  ? 'collection'
                  : 'movie';
                const match = getSavedItems('watchlist').find((item: any) => {
                  const itemType = item.media_type === 'tv' ? 'tv' : item.media_type === 'collection' ? 'collection' : 'movie';
                  return Number(item.id) === Number(change.item.id) && itemType === mediaType;
                });
                if (match) removeSavedItem(Number(change.item.id), 'watchlist', mediaType);
              }
            }
          }
          if (savedCollections !== null) {
            await AsyncStorage.setItem('savedCollections', JSON.stringify(savedCollections));
          }
        } finally { applyingRemoteChanges = false; }

        for (const change of changes) {
          if (change.action === 'set' && change.type === 'watchProgress' && change.value) {
            const localRaw = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
            const localProg = localRaw ? JSON.parse(localRaw) : {};
            const mergedProg = mergeWatchProgressMaps(localProg, change.value);
            const progJson = JSON.stringify(mergedProg);
            await AsyncStorage.setItem('@watch_progress', progJson);
            await AsyncStorage.setItem('watch_progress_v1', progJson);
            DeviceEventEmitter.emit('watcher_watch_progress_changed', mergedProg);
          } else if (change.action === 'remove' && change.type === 'watchProgress' && Number.isFinite(Number(change.mediaId))) {
            const localRaw = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
            const localProg = localRaw ? JSON.parse(localRaw) : {};
            const nextProg = removeWatchProgressEntries(localProg, Number(change.mediaId));
            const progJson = JSON.stringify(nextProg);
            await AsyncStorage.setItem('@watch_progress', progJson);
            await AsyncStorage.setItem('watch_progress_v1', progJson);
            DeviceEventEmitter.emit('watcher_watch_progress_changed', nextProg);
          }
          if (change.action === 'set' && change.type === 'preferences') await applyNsfwPreference(change.value?.nsfwFilterEnabled);
        }
        await AsyncStorage.setItem('cloud_sync_revision', String(nextRevision));
        await persistCurrentSnapshotCache(user.userId);
        lastPollAt = Date.now();
        return { ok: true, updated: true };
      }

      const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      if (snapshot.data?.library) {
        await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || nextRevision));
        lastPollAt = Date.now();
        return { ok: true, updated: true };
      }
      return { ok: false, error: 'Cloud response did not include a library' };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        await handleExpiredSession();
        return { ok: false, error: 'Session expired. Please sign in again.' };
      }
      const message = error?.response?.data?.error || error.message || 'Cloud sync check failed';
      console.warn('Cloud sync check failed:', error?.response?.data || error.message);
      return { ok: false, error: message };
    }
  })();

  inFlightPollPromise = run;
  try {
    return await run;
  } finally {
    if (inFlightPollPromise === run) inFlightPollPromise = null;
  }
}

export async function pollCloudChanges(): Promise<void> {
  await pollCloudChangesWithResult();
}

export async function pollCloudChangesIfStale(maxAgeMs = 15000): Promise<void> {
  if (Date.now() - lastPollAt < maxAgeMs) return;
  await pollCloudChangesWithResult();
}

export interface MobileUserProfile {
  userId: string;
  email: string;
  name: string;
  picture: string;
}

export const cloudSync = {
  /**
   * Get currently authenticated user if logged in
   */
  async getAuthUser(): Promise<MobileUserProfile | null> {
    try {
      const userStr = await AsyncStorage.getItem('cloud_auth_user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  /**
   * Get active session token
   */
  async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('cloud_auth_token');
    } catch {
      return null;
    }
  },

  /**
   * Sign in with Google Token or Credentials
   */
  async loginWithGoogle(idToken?: string, accessToken?: string): Promise<{ success: boolean; user?: MobileUserProfile; error?: string }> {
    try {
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        idToken,
        accessToken,
      }, { timeout: 12000 });

      const { user, token } = response.data;
      if (!user || !token) throw new Error('Invalid response from auth server');
      await prepareLocalLibraryForAccount(user.userId);

      await Promise.all([
        AsyncStorage.setItem('cloud_auth_token', token),
        AsyncStorage.setItem('cloud_auth_user', JSON.stringify(user)),
      ]);
      DeviceEventEmitter.emit('watcher_cloud_auth_changed', user);

      // Immediate sync upon login
      await this.mergeLocalWithCloud();

      return { success: true, user };
    } catch (err: any) {
      console.error('Google mobile login failed:', err?.response?.data || err.message);
      return { success: false, error: err?.response?.data?.error || err.message || 'Login failed' };
    }
  },

  /**
   * 1-Click Demo / Test Account Sign-In
   */
  async loginWithDemo(): Promise<{ success: boolean; user?: MobileUserProfile; error?: string }> {
    try {
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        action: 'demo',
      }, { timeout: 12000 });

      const { user, token } = response.data;
      if (!user || !token) throw new Error('Invalid response from auth server');
      await prepareLocalLibraryForAccount(user.userId);

      await Promise.all([
        AsyncStorage.setItem('cloud_auth_token', token),
        AsyncStorage.setItem('cloud_auth_user', JSON.stringify(user)),
      ]);
      DeviceEventEmitter.emit('watcher_cloud_auth_changed', user);

      await this.mergeLocalWithCloud();

      return { success: true, user };
    } catch (err: any) {
      console.error('Demo mobile login failed:', err?.response?.data || err.message);
      return { success: false, error: err?.message || 'Demo login failed' };
    }
  },

  /**
   * Sign out
   */
  async logout(): Promise<void> {
    const user = await this.getAuthUser();
    try {
      await this.syncWithCloud();
    } catch {
      // Allow signing out cleanly even while offline; local items are restored below.
    }
    setCloudOnlyMode(false);
    if (user?.userId) await AsyncStorage.setItem('cloud_local_library_owner', user.userId);
    await Promise.all([
      AsyncStorage.removeItem('cloud_auth_token'),
      AsyncStorage.removeItem('cloud_auth_user'),
      AsyncStorage.removeItem('last_cloud_sync_time'),
    ]);
    DeviceEventEmitter.emit('watcher_cloud_auth_changed', null);
  },

  /**
   * Full bi-directional sync with cloud
   */
  async mergeLocalWithCloud(): Promise<{ success: boolean; error?: string; message?: string }> {
    const token = await this.getAuthToken();
    if (!token) {
      return { success: false, error: 'Sign in to sync your library' };
    }
    if (initialMergeInFlight) return { success: false, error: 'Initial library merge is already running' };
    initialMergeInFlight = true;

    try {
      await waitForPendingOutboxWrites();
      await flushCloudOutbox({ ignoreBackoff: true });
      const knownRevision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
      if (knownRevision > 0) {
        const delta = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${knownRevision}`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
        });
        if (Array.isArray(delta.data?.changes) && delta.data.changes.some((change: any) => change.action === 'clear' && !change.type)) {
          const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
          if (snapshot.data?.library) {
            await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || delta.data.revision || 0));
            return { success: true, message: 'Cloud library reset applied' };
          }
        }
      }
      // 1. Gather local SQLite items and watch progress
      const localWatchlist = getSavedItems('watchlist') || [];
      const localHistory = getSavedItems('history') || [];
      const localArtists = getSavedItems('artist') || [];
      const localProgressRaw = (await AsyncStorage.getItem('@watch_progress')) || (await AsyncStorage.getItem('watch_progress_v1'));
      const localProgress = localProgressRaw ? JSON.parse(localProgressRaw) : {};
      const savedNsfwRaw = await AsyncStorage.getItem('settings_nsfw');

      const convStr = await AsyncStorage.getItem('watcher.chat.conversations.v1');
      const memStr = await AsyncStorage.getItem('watcher.chat.userMemory.v1');
      const aiNameStr = await AsyncStorage.getItem('watcher.chat.aiName.v1');

      const payload: Record<string, any> = {
        watchlist: localWatchlist,
        history: localHistory,
        favoriteArtists: localArtists,
        watchProgress: localProgress,
        aiChatData: { conversations: convStr ? JSON.parse(convStr) : [], userMemory: memStr || '', aiName: aiNameStr || 'Cine' },
        mode: 'merge',
      };
      if (savedNsfwRaw !== null) {
        try {
          payload.preferences = { nsfwFilterEnabled: JSON.parse(savedNsfwRaw) === true };
        } catch {}
      }

      // 2. Post to cloud sync endpoint
      let response: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await axios.post(`${AUTH_API_BASE}/api/sync`, payload, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            timeout: 15000,
          });
          break;
        } catch (error: any) {
          if (error?.response?.status !== 409 || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }

      const merged = response.data?.library;
      if (!merged) {
        throw new Error('Sync response did not contain library data');
      }

      await applyCloudLibrary(merged, Number(response.data?.revision || 0));
      await AsyncStorage.setItem('last_cloud_sync_time', new Date().toISOString());
      lastPollAt = Date.now();

      return {
        success: true,
        message: `Synced ${merged.watchlist?.length || 0} watchlist, ${merged.history?.length || 0} history items`
      };
    } catch (err: any) {
      if (err?.response?.status === 401) {
        await handleExpiredSession();
      }
      console.error('Mobile cloud sync error:', err?.response?.data || err.message);
      return { success: false, error: err?.response?.data?.error || err.message || 'Sync failed' };
    } finally { initialMergeInFlight = false; }
  },

  async syncWithCloud(): Promise<{ success: boolean; error?: string; message?: string }> {
    const token = await this.getAuthToken();
    if (!token) return { success: false, error: 'Sign in to sync your library' };
    const result = await pollCloudChangesWithResult({ ignoreBackoff: true });
    if (!result.ok) {
      return { success: false, error: result.error || 'Sync failed' };
    }
    await AsyncStorage.setItem('last_cloud_sync_time', new Date().toISOString());
    return {
      success: true,
      message: result.updated ? 'Synced latest cloud updates' : 'Cloud library is up to date',
    };
  },
};
