import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Crypto from 'expo-crypto';
import { DeviceEventEmitter } from 'react-native';
import { getSavedItems, addSavedItem, removeSavedItem, clearSavedItems, setCloudOnlyMode, SavedItemsMutation } from './database';
import { GLOBAL_CONFIG, setGlobalConfig } from './tmdb';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';
let applyingRemoteChanges = false;
let syncQueue: Promise<unknown> = Promise.resolve();
let pollInFlight = false;
let initialMergeInFlight = false;
let flushingOutbox = false;
let retryDelay = 1000;
let retryAfter = 0;

const outboxKey = (userId: string) => `cloud_sync_outbox_v1:${userId}`;
const snapshotCacheKey = (userId: string) => `cloud_library_snapshot_v1:${userId}`;

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

async function prepareLocalLibraryForAccount(userId: string) {
  const owner = await AsyncStorage.getItem('cloud_local_library_owner');
  if (owner && owner !== userId) {
    applyingRemoteChanges = true;
    try {
      setCloudOnlyMode(false);
      clearSavedItems('watchlist', false);
      clearSavedItems('history', false);
      clearSavedItems('artist', false);
      for (const key of ['savedCollections', 'watch_progress_v1', 'watcher.chat.conversations.v1', 'watcher.chat.userMemory.v1', 'watcher.chat.aiName.v1']) {
        await AsyncStorage.removeItem(key);
      }
      await AsyncStorage.removeItem('cloud_sync_revision');
    } finally { applyingRemoteChanges = false; }
  }
  await AsyncStorage.setItem('cloud_local_library_owner', userId);
}

async function enqueueCloudOperation(operation: any) {
  syncQueue = syncQueue.then(async () => {
    const user = await cloudSync.getAuthUser();
    if (!user) return;
    const key = outboxKey(user.userId);
    let outbox: any[] = [];
    try { outbox = JSON.parse((await AsyncStorage.getItem(key)) || '[]'); } catch { outbox = []; }
    outbox.push({ ...operation, operationId: Crypto.randomUUID(), clientTimestamp: Date.now() });
    await AsyncStorage.setItem(key, JSON.stringify(outbox));
    await flushCloudOutbox();
  }).catch(error => console.warn('Could not queue cloud edit:', error?.message));
}

export async function flushCloudOutbox(): Promise<void> {
  if (flushingOutbox || Date.now() < retryAfter) return;
  const [user, token] = await Promise.all([cloudSync.getAuthUser(), cloudSync.getAuthToken()]);
  if (!user || !token) return;
  flushingOutbox = true;
  const key = outboxKey(user.userId);
  try {
    while (true) {
      let outbox: any[] = [];
      try { outbox = JSON.parse((await AsyncStorage.getItem(key)) || '[]'); } catch { outbox = []; }
      const operation = outbox[0];
      if (!operation) { retryAfter = 0; retryDelay = 1000; break; }
      try {
        await axios.post(`${AUTH_API_BASE}/api/sync`, { action: 'mutate', mutation: operation }, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
        });
        await AsyncStorage.setItem(key, JSON.stringify(outbox.slice(1)));
        retryAfter = 0;
      } catch (error: any) {
        // Keep the same operation ID on retry. A 409 means the API exhausted
        // its bounded compare-and-swap retries during concurrent edits; do not
        // spin forever in the foreground while other devices are busy.
        retryAfter = Date.now() + retryDelay;
        retryDelay = Math.min(30000, retryDelay * 2);
        console.warn('Cloud edit saved for retry:', error?.response?.data || error.message);
        break;
      }
    }
  } finally { flushingOutbox = false; }
}

const apiType = (type: SavedItemsMutation['type']) => type === 'artist' ? 'favoriteArtists' : type;

export const queueCloudMutation = (mutation: SavedItemsMutation) => {
  if (applyingRemoteChanges) return;
  void enqueueCloudOperation({ ...mutation, type: apiType(mutation.type) });
};

export const queueCloudValue = (type: 'preferences' | 'watchProgress', value: any) => {
  if (applyingRemoteChanges) return;
  void enqueueCloudOperation({ type, action: 'set', value });
};

async function applyCloudLibrary(library: any, revision: number) {
  setCloudOnlyMode(true, library);
  await applyNsfwPreference(library?.preferences?.nsfwFilterEnabled);
  await AsyncStorage.setItem('watch_progress_v1', JSON.stringify(library?.watchProgress || {}));
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
  setCloudOnlyMode(true);
  const cachedLibrary = await readSnapshotCache(user.userId);
  if (cachedLibrary) {
    setCloudOnlyMode(true, cachedLibrary);
    await applyNsfwPreference(cachedLibrary.preferences?.nsfwFilterEnabled);
  }
  const revision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
  if (revision > 0) {
    await pollCloudChanges();
    return;
  }

  if (pollInFlight) return;
  pollInFlight = true;
  void (async () => {
    try {
      const response = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      if (response.data?.library) await applyCloudLibrary(response.data.library, Number(response.data.revision || 0));
    } catch (error: any) {
      console.warn('Signed-in library will load when the API is reachable:', error?.response?.data || error.message);
    } finally { pollInFlight = false; }
  })();
}

export async function pollCloudChanges(): Promise<void> {
  if (pollInFlight || initialMergeInFlight) return;
  pollInFlight = true;
  try {
    const token = await cloudSync.getAuthToken();
    if (!token) return;
    void flushCloudOutbox();
    const revision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
    if (revision <= 0) {
      setCloudOnlyMode(true);
      const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      if (snapshot.data?.library) await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || 0));
      return;
    }
    const response = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${revision}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
    });
    const nextRevision = Number(response.data?.revision || 0);
    if (!nextRevision || nextRevision === revision) return;
    const changes = response.data?.changes;
    const completeDelta = Array.isArray(changes) && changes.length > 0 &&
      changes.length === nextRevision - revision &&
      changes.every((change: any, index: number) => change.revision === revision + index + 1 && change.type && change.action !== 'snapshot');
    if (response.data?.status === 'delta' && completeDelta) {
      applyingRemoteChanges = true;
      try {
        for (const change of changes) {
          const type = (change.type === 'favoriteArtists' ? 'artist' : change.type) as 'watchlist' | 'history' | 'artist';
          if (!['watchlist', 'history', 'artist'].includes(type)) continue;
          if (change.action === 'clear') clearSavedItems(type);
          else if (change.action === 'remove') removeSavedItem(Number(change.mediaId), type, change.mediaType);
          else if (change.action === 'add' && change.item) {
            addSavedItem(change.item, type);
            if (type === 'history' && change.removesMatchingWatchlistItem) {
              const mediaType = change.item.media_type === 'tv' ? 'tv' : 'movie';
              const match = getSavedItems('watchlist').find((item: any) => Number(item.id) === Number(change.item.id) && (item.media_type === 'tv' ? 'tv' : 'movie') === mediaType);
              if (match) removeSavedItem(Number(change.item.id), 'watchlist', mediaType);
            }
          }
        }
      } finally { applyingRemoteChanges = false; }
      for (const change of changes) {
        if (change.action === 'set' && change.type === 'watchProgress' && change.value) await AsyncStorage.setItem('watch_progress_v1', JSON.stringify(change.value));
        if (change.action === 'set' && change.type === 'preferences') await applyNsfwPreference(change.value?.nsfwFilterEnabled);
      }
      await AsyncStorage.setItem('cloud_sync_revision', String(nextRevision));
      await writeSnapshotCache({
        watchlist: getSavedItems('watchlist'),
        history: getSavedItems('history'),
        favoriteArtists: getSavedItems('artist'),
        preferences: { nsfwFilterEnabled: GLOBAL_CONFIG.nsfwFilterEnabled },
      }, (await cloudSync.getAuthUser())?.userId);
      return;
    }
    const snapshot = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
    if (snapshot.data?.library) await applyCloudLibrary(snapshot.data.library, Number(snapshot.data.revision || nextRevision));
  } catch (error: any) {
    console.warn('Cloud sync check failed:', error?.response?.data || error.message);
  } finally { pollInFlight = false; }
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
    await this.syncWithCloud();
    setCloudOnlyMode(false);
    if (user?.userId) await AsyncStorage.setItem('cloud_local_library_owner', user.userId);
    await Promise.all([
      AsyncStorage.removeItem('cloud_auth_token'),
      AsyncStorage.removeItem('cloud_auth_user'),
      AsyncStorage.removeItem('last_cloud_sync_time'),
    ]);
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
      await flushCloudOutbox();
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
      // 1. Gather local SQLite items
      const localWatchlist = getSavedItems('watchlist') || [];
      const localHistory = getSavedItems('history') || [];
      const localArtists = getSavedItems('artist') || [];
      
      const convStr = await AsyncStorage.getItem('watcher.chat.conversations.v1');
      const memStr = await AsyncStorage.getItem('watcher.chat.userMemory.v1');
      const aiNameStr = await AsyncStorage.getItem('watcher.chat.aiName.v1');

      // 2. Post to cloud sync endpoint
      let response: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          response = await axios.post(`${AUTH_API_BASE}/api/sync`, {
            watchlist: localWatchlist, history: localHistory, favoriteArtists: localArtists,
            aiChatData: { conversations: convStr ? JSON.parse(convStr) : [], userMemory: memStr || '', aiName: aiNameStr || 'Cine' },
            mode: 'merge',
          }, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, timeout: 15000 });
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

      return { 
        success: true, 
        message: `Synced ${merged.watchlist?.length || 0} watchlist, ${merged.history?.length || 0} history items` 
      };
    } catch (err: any) {
      console.error('Mobile cloud sync error:', err?.response?.data || err.message);
      return { success: false, error: err?.response?.data?.error || err.message || 'Sync failed' };
    } finally { initialMergeInFlight = false; }
  },

  async syncWithCloud(): Promise<{ success: boolean; error?: string; message?: string }> {
    const token = await this.getAuthToken();
    if (!token) return { success: false, error: 'Sign in to sync your library' };
    try {
      await flushCloudOutbox();
      const knownRevision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
      if (knownRevision > 0) {
        await pollCloudChanges();
        return { success: true, message: 'Cloud library is up to date' };
      }
      const response = await axios.get(`${AUTH_API_BASE}/api/sync`, { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 });
      if (!response.data?.library) throw new Error('Cloud response did not include a library');
      await applyCloudLibrary(response.data.library, Number(response.data.revision || 0));
      return { success: true, message: 'Loaded the cloud library' };
    } catch (error: any) {
      return { success: false, error: error?.response?.data?.error || error.message || 'Sync failed' };
    }
  },
};
