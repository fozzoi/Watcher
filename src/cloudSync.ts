import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { getSavedItems, addSavedItem, removeSavedItem, clearSavedItems, setCloudOnlyMode, SavedItemsMutation, setOnSavedItemsChangedListener, addSavedItemsChangeListener } from './database';
import { GLOBAL_CONFIG, setGlobalConfig } from './tmdb';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';

function formatAxiosError(error: any): string {
  if (!error) return 'Unknown error';
  if (error.code === 'ECONNABORTED' || (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'))) {
    const timeout = error.config?.timeout ? `${error.config.timeout}ms` : 'configured timeout';
    return `Network timeout (${timeout} exceeded contacting server)`;
  }
  if (error.response) {
    const status = error.response.status;
    const serverErr = error.response.data?.error || error.response.data?.message;
    return serverErr ? `Server error (${status}): ${serverErr}` : `HTTP ${status} (${error.response.statusText || 'Error'})`;
  }
  if (error.message === 'Network Error') {
    return 'Network unreachable. Please check your internet connection or server status.';
  }
  if (error.request && !error.response) {
    return `No response from server (${error.code || error.message || 'connection failed'})`;
  }
  return error.message || 'Sync failed';
}

function logSync(tag: string, message: string, meta?: any) {
  const prefix = `[CloudSync:${tag}]`;
  if (meta !== undefined) {
    console.log(`${prefix} ${message}`, meta);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function warnSync(tag: string, message: string, meta?: any) {
  const prefix = `[CloudSync:${tag}]`;
  if (meta !== undefined) {
    console.warn(`${prefix} ${message}`, meta);
  } else {
    console.warn(`${prefix} ${message}`);
  }
}

function errorSync(tag: string, message: string, meta?: any) {
  const prefix = `[CloudSync:${tag}]`;
  if (meta !== undefined) {
    console.error(`${prefix} ${message}`, meta);
  } else {
    console.error(`${prefix} ${message}`);
  }
}

function sanitizeAiChatForSync(chatData: any) {
  if (!chatData || typeof chatData !== 'object') return undefined;
  const conversations = Array.isArray(chatData.conversations)
    ? chatData.conversations.slice(0, 10).map((c: any) => ({
        id: String(c.id || '').slice(0, 64),
        title: String(c.title || '').slice(0, 100),
        updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
        messages: Array.isArray(c.messages)
          ? c.messages.slice(-15).map((m: any) => ({
              id: m.id,
              role: m.role,
              text: String(m.text || '').slice(0, 1500),
              timestamp: m.timestamp || Date.now(),
            }))
          : [],
      }))
    : [];
  return {
    conversations,
    userMemory: typeof chatData.userMemory === 'string' ? chatData.userMemory.slice(0, 4000) : '',
    aiName: typeof chatData.aiName === 'string' ? chatData.aiName.slice(0, 50) : 'Cine',
  };
}

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
let lastFlushedSnapshotMergeTime = 0;

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
    if (!user) {
      console.warn(`[CloudSync:Outbox] Cannot queue mutation (${operation?.type}:${operation?.action}): User is NOT signed in. Items will sync when signed in.`);
      return;
    }
    await withOutboxLock(async () => {
      const outbox = await readOutboxRaw(user.userId);
      const nextOp = { ...operation, operationId: Crypto.randomUUID(), clientTimestamp: Date.now() };

      // Coalesce pending non-in-flight librarySnapshotMerge so multiple restores/merges don't queue multiple full payloads
      if (nextOp.type === 'librarySnapshotMerge') {
        const idx = outbox.findIndex(
          (op: any) =>
            op &&
            op.type === 'librarySnapshotMerge' &&
            op.operationId !== inFlightOperationId
        );
        if (idx >= 0) {
          outbox[idx] = nextOp;
          await writeOutboxRaw(user.userId, outbox);
          await persistCurrentSnapshotCache(user.userId);
          console.log(`[CloudSync:Outbox] Replaced pending librarySnapshotMerge for user ${user.userId}. Outbox count: ${outbox.length}`);
          return;
        }
      }

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
          console.log(`[CloudSync:Outbox] Coalesced ${nextOp.type}:set for user ${user.userId}. Outbox count: ${outbox.length}`);
          return;
        }
      }

      outbox.push(nextOp);
      await writeOutboxRaw(user.userId, outbox);
      await persistCurrentSnapshotCache(user.userId);
      console.log(`[CloudSync:Outbox] Queued ${nextOp.type}:${nextOp.action} id=${nextOp.mediaId ?? nextOp.item?.id ?? 'none'} opId=${nextOp.operationId} for user ${user.userId}. Outbox count: ${outbox.length}`);
    });
    void flushCloudOutbox({ ignoreBackoff: true });
  } catch (error: any) {
    console.warn('[CloudSync:Outbox] Could not queue cloud edit:', error?.message);
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
    logSync('Outbox', `Backoff active (${Math.max(0, retryAfter - Date.now())}ms remaining), skipping flush`);
    return { flushed: remaining === 0, remaining };
  }

  const run = async (): Promise<FlushResult> => {
    const [user, token] = await Promise.all([cloudSync.getAuthUser(), cloudSync.getAuthToken()]);
    if (!user || !token) {
      warnSync('Outbox', 'Cannot flush: user not signed in');
      return { flushed: false, remaining: 0, error: 'Not signed in' };
    }

    let lastError: string | undefined;
    try {
      while (true) {
        const operation = await withOutboxLock(async () => {
          const outbox = await readOutboxRaw(user.userId);
          let modified = false;
          const sanitizedOutbox: any[] = [];
          for (const op of outbox) {
            if (!op || !op.type || op.type === 'tasteTelemetry') {
              modified = true;
              continue;
            }
            // Auto-compact any oversized pending snapshot merges (e.g. from restored backups)
            if (op.type === 'librarySnapshotMerge' && op.value?.aiChatData) {
              const beforeLen = JSON.stringify(op.value.aiChatData).length;
              const compacted = sanitizeAiChatForSync(op.value.aiChatData);
              const afterLen = JSON.stringify(compacted).length;
              if (afterLen < beforeLen) {
                op.value.aiChatData = compacted;
                logSync('Outbox', `Auto-compacted oversized snapshot merge ${op.operationId} (chat data: ${(beforeLen / 1024).toFixed(1)} KB -> ${(afterLen / 1024).toFixed(1)} KB)`);
                modified = true;
              }
            }
            sanitizedOutbox.push(op);
          }

          // Prioritize granular item mutations (watchlist, history, artists, progress, preferences)
          // ahead of heavy library snapshot merges so single-item adds/removals upload immediately!
          sanitizedOutbox.sort((a, b) => {
            const aIsSnapshot = a.type === 'librarySnapshotMerge';
            const bIsSnapshot = b.type === 'librarySnapshotMerge';
            if (aIsSnapshot && !bIsSnapshot) return 1;
            if (!aIsSnapshot && bIsSnapshot) return -1;
            return (a.clientTimestamp || 0) - (b.clientTimestamp || 0);
          });

          if (modified) {
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
        const opStart = Date.now();
        try {
          const isSnapshotMerge = operation.type === 'librarySnapshotMerge' && operation.action === 'merge';
          const requestBody = isSnapshotMerge
            ? { ...(operation.value || {}), mode: 'merge' }
            : { action: 'mutate', mutation: operation };
          const timeout = isSnapshotMerge ? 45000 : 30000;
          const bodySizeKb = (JSON.stringify(requestBody).length / 1024).toFixed(1);
          logSync('Outbox', `Flushing op type=${operation.type} action=${operation.action} mediaId=${operation.mediaId ?? operation.item?.id ?? 'none'} opId=${operation.operationId} (~${bodySizeKb} KB, timeout ${timeout}ms)...`);

          const response = await axios.post(`${AUTH_API_BASE}/api/sync`, requestBody, {
            headers: { Authorization: `Bearer ${token}` },
            timeout,
          });

          logSync('Outbox', `SUCCESS opId=${operation.operationId} in ${Date.now() - opStart}ms: status=${response.data?.status} rev=${response.data?.revision ?? '?'}`);

          await withOutboxLock(async () => {
            const current = await readOutboxRaw(user.userId);
            const next = current.filter((op: any) => op?.operationId !== operation.operationId);
            await writeOutboxRaw(user.userId, next);
          });

          if (isSnapshotMerge) {
            lastFlushedSnapshotMergeTime = Date.now();
            if (response.data?.revision) {
              await AsyncStorage.setItem('cloud_sync_revision', String(response.data.revision));
            }
            if (response.data?.library) {
              await applyCloudLibrary(response.data.library, Number(response.data.revision || 0));
            }
          }

          // Keep the last applied revision unchanged. This mutation's revision may
          // follow edits from another device, and jumping to it would skip those
          // deltas (including server side effects such as history removing watchlist items).

          retryAfter = 0;
          retryDelay = 1000;
        } catch (error: any) {
          const status = error?.response?.status;
          const elapsed = Date.now() - opStart;
          const formattedErr = formatAxiosError(error);

          if (status === 400) {
            warnSync('Outbox', `Dropping invalid mutation (${status}) after ${elapsed}ms: ${formattedErr}`, { type: operation?.type, data: error?.response?.data });
            await withOutboxLock(async () => {
              const current = await readOutboxRaw(user.userId);
              const next = current.filter((op: any) => op?.operationId !== operation.operationId);
              await writeOutboxRaw(user.userId, next);
            });
            continue;
          }
          if (status === 401) {
            warnSync('Outbox', `Session expired (401) after ${elapsed}ms; handling sign out`);
            await handleExpiredSession();
            return { flushed: false, remaining: 0, error: 'Session expired. Please sign in again.' };
          }

          if (operation.type === 'librarySnapshotMerge') {
            const failCount = (operation.failures || 0) + 1;
            if (failCount >= 3) {
              warnSync('Outbox', `Snapshot merge ${operation.operationId} failed ${failCount} times (${formattedErr}); dropping from outbox to prevent blocking granular edits. Tap Settings > Sync with Cloud to retry.`);
              await withOutboxLock(async () => {
                const current = await readOutboxRaw(user.userId);
                const next = current.filter((op: any) => op?.operationId !== operation.operationId);
                await writeOutboxRaw(user.userId, next);
              });
              continue;
            } else {
              await withOutboxLock(async () => {
                const current = await readOutboxRaw(user.userId);
                const target = current.find((op: any) => op?.operationId === operation.operationId);
                if (target) target.failures = failCount;
                await writeOutboxRaw(user.userId, current);
              });
            }
          }

          retryAfter = Date.now() + retryDelay;
          retryDelay = Math.min(30000, retryDelay * 2);
          lastError = formattedErr;
          warnSync('Outbox', `Failed to flush edit after ${elapsed}ms (retry in ${retryDelay / 1000}s): ${formattedErr}`, {
            status,
            code: error?.code,
            details: error?.response?.data,
          });
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
  };

  const runPromise = run();
  inFlightFlushPromise = runPromise;
  try {
    return await runPromise;
  } finally {
    if (inFlightFlushPromise === runPromise) inFlightFlushPromise = null;
  }
}

const apiType = (type: SavedItemsMutation['type']) => type === 'artist' ? 'favoriteArtists' : type;

export const queueCloudMutation = (mutation: SavedItemsMutation) => {
  console.log(`[CloudSync:Queue] queueCloudMutation: type=${mutation.type} action=${mutation.action} id=${mutation.item?.id ?? mutation.mediaId ?? 'none'} (applyingRemoteChanges=${applyingRemoteChanges}, paused=${cloudMutationQueuePaused})`);
  if (applyingRemoteChanges || cloudMutationQueuePaused) {
    console.log(`[CloudSync:Queue] Mutation skipped (applyingRemoteChanges=${applyingRemoteChanges}, paused=${cloudMutationQueuePaused})`);
    return;
  }
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
    aiChatData: sanitizeAiChatForSync({
      conversations: Array.isArray(conversations) ? conversations : [],
      userMemory: userMemory || '',
      aiName: aiName || 'Cine',
    }),
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

export async function pollCloudChangesWithResult(options?: { ignoreBackoff?: boolean }): Promise<PollResult> {
  if (initialMergeInFlight) {
    logSync('Poll', 'Bailing: initial library merge is already in flight');
    return { ok: false, error: 'Initial library merge is already running' };
  }
  if (inFlightPollPromise) return inFlightPollPromise;

  const run = async (): Promise<PollResult> => {
    const pollStart = Date.now();
    try {
      const [token, user] = await Promise.all([cloudSync.getAuthToken(), cloudSync.getAuthUser()]);
      if (!token || !user) {
        logSync('Poll', 'Bailing: not signed in');
        return { ok: false, error: 'Sign in to sync your library' };
      }

      // Ensure pending local mutations are serialized and flushed before pulling
      // remote state so snapshots never clobber unsynced local edits.
      await waitForPendingOutboxWrites();
      const flushResult = await flushCloudOutbox({ ignoreBackoff: options?.ignoreBackoff });
      if (!flushResult.flushed || flushResult.remaining > 0) {
        warnSync('Poll', `Outbox has ${flushResult.remaining} pending edits that could not be uploaded`, flushResult.error);
        return { ok: false, error: flushResult.error || 'Could not upload local edits yet' };
      }

      // Earlier clients advanced this checkpoint on upload and could skip edits
      // from other devices. Rebuild this account's local view once from the cloud.
      const repairKey = revisionRepairKey(user.userId);
      if (await AsyncStorage.getItem(repairKey) === null) {
        logSync('Poll', `Running one-time revision repair for user ${user.userId}`);
        await AsyncStorage.removeItem('cloud_sync_revision');
        await AsyncStorage.setItem(repairKey, 'true');
      }

      const savedRevision = await AsyncStorage.getItem('cloud_sync_revision');
      logSync('Poll', `Checking cloud changes... localRev=${savedRevision ?? 'none'}`);

      if (savedRevision === null) {
        logSync('Poll', 'Local revision is null; fetching full snapshot...');
        setCloudOnlyMode(true);
        const snapStart = Date.now();
        const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 45000,
        });
        if (snapshot.data?.library) {
          const lib = snapshot.data.library;
          logSync('Poll', `Full snapshot received in ${Date.now() - snapStart}ms: rev=${snapshot.data.revision} watchlist=${lib.watchlist?.length ?? 0} history=${lib.history?.length ?? 0}`);
          await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || 0));
          lastPollAt = Date.now();
          return { ok: true, updated: true };
        }
        return { ok: false, error: 'Cloud response did not include a library' };
      }

      const revision = Number(savedRevision || 0);
      const deltaStart = Date.now();
      const response = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${revision}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 25000,
      });
      const nextRevision = Number(response.data?.revision || 0);
      logSync('Poll', `Delta GET in ${Date.now() - deltaStart}ms: server rev=${nextRevision} status=${response.data?.status}`);

      if (!nextRevision || nextRevision <= revision) {
        logSync('Poll', `Up to date (local rev=${revision}, server rev=${nextRevision}) in ${Date.now() - pollStart}ms`);
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
        logSync('Poll', `Applying ${changes.length} delta mutations (rev ${revision + 1}..${nextRevision})...`);
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
        logSync('Poll', `Delta applied successfully (rev=${nextRevision}) in ${Date.now() - pollStart}ms`);
        return { ok: true, updated: true };
      }

      logSync('Poll', 'Delta incomplete or fell through; downloading full snapshot...');
      const snapStart = Date.now();
      const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 45000,
      });
      if (snapshot.data?.library) {
        const lib = snapshot.data.library;
        logSync('Poll', `Full snapshot applied in ${Date.now() - snapStart}ms: rev=${snapshot.data.revision || nextRevision} watchlist=${lib.watchlist?.length ?? 0} history=${lib.history?.length ?? 0}`);
        await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || nextRevision));
        lastPollAt = Date.now();
        return { ok: true, updated: true };
      }
      return { ok: false, error: 'Cloud response did not include a library' };
    } catch (error: any) {
      const elapsed = Date.now() - pollStart;
      const formattedErr = formatAxiosError(error);
      if (error?.response?.status === 401) {
        warnSync('Poll', `Session expired (401) after ${elapsed}ms; handling sign out`);
        await handleExpiredSession();
        return { ok: false, error: 'Session expired. Please sign in again.' };
      }
      warnSync('Poll', `Poll failed after ${elapsed}ms: ${formattedErr}`, {
        status: error?.response?.status,
        code: error?.code,
        message: error?.message,
      });
      return { ok: false, error: formattedErr };
    }
  };

  const runPromise = run();
  inFlightPollPromise = runPromise;
  try {
    return await runPromise;
  } finally {
    if (inFlightPollPromise === runPromise) inFlightPollPromise = null;
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
    const loginStart = Date.now();
    try {
      logSync('Auth', 'Initiating Google mobile login...');
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        idToken,
        accessToken,
      }, { timeout: 25000 });

      const { user, token } = response.data;
      if (!user || !token) throw new Error('Invalid response from auth server');
      logSync('Auth', `Google login success in ${Date.now() - loginStart}ms for userId=${user.userId}`);
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
      const formattedErr = formatAxiosError(err);
      errorSync('Auth', `Google mobile login failed in ${Date.now() - loginStart}ms: ${formattedErr}`, err?.response?.data || err.message);
      return { success: false, error: formattedErr };
    }
  },

  /**
   * 1-Click Demo / Test Account Sign-In
   */
  async loginWithDemo(): Promise<{ success: boolean; user?: MobileUserProfile; error?: string }> {
    const loginStart = Date.now();
    try {
      logSync('Auth', 'Initiating Demo account login...');
      const response = await axios.post(`${AUTH_API_BASE}/api/auth`, {
        action: 'demo',
      }, { timeout: 25000 });

      const { user, token } = response.data;
      if (!user || !token) throw new Error('Invalid response from auth server');
      logSync('Auth', `Demo login success in ${Date.now() - loginStart}ms for userId=${user.userId}`);
      await prepareLocalLibraryForAccount(user.userId);

      await Promise.all([
        AsyncStorage.setItem('cloud_auth_token', token),
        AsyncStorage.setItem('cloud_auth_user', JSON.stringify(user)),
      ]);
      DeviceEventEmitter.emit('watcher_cloud_auth_changed', user);

      await this.mergeLocalWithCloud();

      return { success: true, user };
    } catch (err: any) {
      const formattedErr = formatAxiosError(err);
      errorSync('Auth', `Demo mobile login failed in ${Date.now() - loginStart}ms: ${formattedErr}`, err?.response?.data || err.message);
      return { success: false, error: formattedErr };
    }
  },

  /**
   * Sign out
   */
  async logout(): Promise<void> {
    const user = await this.getAuthUser();
    logSync('Auth', `Logging out user ${user?.userId || 'unknown'}`);
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
    const mergeStart = Date.now();
    const token = await this.getAuthToken();
    if (!token) {
      warnSync('Merge', 'Bailing: not signed in');
      return { success: false, error: 'Sign in to sync your library' };
    }
    if (initialMergeInFlight) {
      warnSync('Merge', 'Bailing: merge already in flight');
      return { success: false, error: 'Initial library merge is already running' };
    }
    initialMergeInFlight = true;

    try {
      const preMergeStart = Date.now();
      await waitForPendingOutboxWrites();
      logSync('Merge', 'Flushing outbox before snapshot merge...');
      await flushCloudOutbox({ ignoreBackoff: true });

      // If a full snapshot merge was already completed and applied during outbox flush, skip redundant upload
      if (lastFlushedSnapshotMergeTime >= preMergeStart) {
        logSync('Merge', 'Full snapshot merge was already completed and applied during outbox flush; skipping redundant upload');
        return {
          success: true,
          message: 'Cloud library synchronized',
        };
      }

      const knownRevision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
      if (knownRevision > 0) {
        logSync('Merge', `Checking delta since rev=${knownRevision}...`);
        const delta = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${knownRevision}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 25000,
        });
        if (Array.isArray(delta.data?.changes) && delta.data.changes.some((change: any) => change.action === 'clear' && !change.type)) {
          logSync('Merge', 'Clear action detected in delta; fetching clean cloud snapshot...');
          const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 45000,
          });
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
        aiChatData: sanitizeAiChatForSync({
          conversations: convStr ? JSON.parse(convStr) : [],
          userMemory: memStr || '',
          aiName: aiNameStr || 'Cine',
        }),
        mode: 'merge',
      };
      if (savedNsfwRaw !== null) {
        try {
          payload.preferences = { nsfwFilterEnabled: JSON.parse(savedNsfwRaw) === true };
        } catch {}
      }

      const payloadKb = (JSON.stringify(payload).length / 1024).toFixed(1);
      logSync('Merge', `Uploading full local library (~${payloadKb} KB): watchlist=${localWatchlist.length}, history=${localHistory.length}, artists=${localArtists.length}, progress=${Object.keys(localProgress).length}...`);

      // 2. Post to cloud sync endpoint with retry
      let response: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const attemptStart = Date.now();
          response = await axios.post(`${AUTH_API_BASE}/api/sync`, payload, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            timeout: 45000,
          });
          logSync('Merge', `POST snapshot attempt ${attempt + 1} succeeded in ${Date.now() - attemptStart}ms`);
          break;
        } catch (error: any) {
          const formattedErr = formatAxiosError(error);
          warnSync('Merge', `POST snapshot attempt ${attempt + 1} failed: ${formattedErr}`, { status: error?.response?.status, code: error?.code });
          if (error?.response?.status !== 409 || attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }

      const merged = response.data?.library;
      if (!merged) {
        throw new Error('Sync response did not contain library data');
      }

      logSync('Merge', `Applying merged library (revision ${response.data?.revision}): watchlist=${merged.watchlist?.length ?? 0}, history=${merged.history?.length ?? 0}`);
      await applyCloudLibrary(merged, Number(response.data?.revision || 0));
      await AsyncStorage.setItem('last_cloud_sync_time', new Date().toISOString());
      lastPollAt = Date.now();

      logSync('Merge', `Full merge completed successfully in ${Date.now() - mergeStart}ms`);
      return {
        success: true,
        message: `Synced ${merged.watchlist?.length || 0} watchlist, ${merged.history?.length || 0} history items`
      };
    } catch (err: any) {
      const elapsed = Date.now() - mergeStart;
      const formattedErr = formatAxiosError(err);
      if (err?.response?.status === 401) {
        warnSync('Merge', `Session expired (401) after ${elapsed}ms; handling sign out`);
        await handleExpiredSession();
      }
      errorSync('Merge', `Full merge failed after ${elapsed}ms: ${formattedErr}`, {
        status: err?.response?.status,
        code: err?.code,
        message: err?.message,
      });
      return { success: false, error: formattedErr };
    } finally {
      initialMergeInFlight = false;
    }
  },

  async syncWithCloud(): Promise<{ success: boolean; error?: string; message?: string }> {
    const syncStart = Date.now();
    logSync('Sync', 'Triggering syncWithCloud...');
    const token = await this.getAuthToken();
    if (!token) return { success: false, error: 'Sign in to sync your library' };
    const result = await pollCloudChangesWithResult({ ignoreBackoff: true });
    if (!result.ok) {
      warnSync('Sync', `syncWithCloud failed in ${Date.now() - syncStart}ms: ${result.error}`);
      return { success: false, error: result.error || 'Sync failed' };
    }
    await AsyncStorage.setItem('last_cloud_sync_time', new Date().toISOString());
    logSync('Sync', `syncWithCloud finished in ${Date.now() - syncStart}ms (updated=${result.updated})`);
    return {
      success: true,
      message: result.updated ? 'Synced latest cloud updates' : 'Cloud library is up to date',
    };
  },
};
