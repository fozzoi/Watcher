import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getSavedItems, addSavedItem, removeSavedItem, clearSavedItems, SavedItemsMutation } from './database';
import { DEFAULT_PREFERENCES, getUserPreferences, setUserPreferences } from './userPreferences';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';
let applyingRemoteChanges = false;
let syncQueue: Promise<unknown> = Promise.resolve();
let pollInFlight = false;

const apiType = (type: SavedItemsMutation['type']) => type === 'artist' ? 'favoriteArtists' : type;

export const queueCloudMutation = (mutation: SavedItemsMutation) => {
  if (applyingRemoteChanges) return;
  syncQueue = syncQueue.then(async () => {
    const token = await cloudSync.getAuthToken();
    if (!token) return;
    const response = await axios.post(`${AUTH_API_BASE}/api/sync`, {
      action: 'mutate', mutation: { ...mutation, type: apiType(mutation.type) },
    }, { headers: { Authorization: `Bearer ${token}` }, timeout: 12000 });
    if (response.data?.revision) await AsyncStorage.setItem('cloud_sync_revision', String(response.data.revision));
  }).catch(error => console.warn('Cloud library mutation failed:', error?.response?.data || error.message));
};

export const queueCloudValue = (type: 'preferences' | 'watchProgress', value: any) => {
  if (applyingRemoteChanges) return;
  syncQueue = syncQueue.then(async () => {
    const token = await cloudSync.getAuthToken();
    if (!token) return;
    const response = await axios.post(`${AUTH_API_BASE}/api/sync`, { action: 'mutate', mutation: { type, action: 'set', value } }, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
    });
    if (response.data?.revision) await AsyncStorage.setItem('cloud_sync_revision', String(response.data.revision));
  }).catch(error => console.warn('Cloud library setting sync failed:', error?.response?.data || error.message));
};

async function applyCloudLibrary(library: any, revision: number) {
  applyingRemoteChanges = true;
  try {
    for (const type of ['watchlist', 'history', 'artist'] as const) {
      clearSavedItems(type);
      const remoteType = type === 'artist' ? 'favoriteArtists' : type;
      for (const item of Array.isArray(library?.[remoteType]) ? library[remoteType] : []) addSavedItem(item, type);
    }
    await setUserPreferences(library?.preferences && typeof library.preferences === 'object' ? library.preferences : DEFAULT_PREFERENCES);
    await AsyncStorage.setItem('watch_progress_v1', JSON.stringify(library?.watchProgress || {}));
    await AsyncStorage.setItem('savedCollections', JSON.stringify(Array.isArray(library?.savedCollections) ? library.savedCollections : []));
    const chat = library?.aiChatData;
    await AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(Array.isArray(chat?.conversations) ? chat.conversations : []));
    await AsyncStorage.setItem('watcher.chat.userMemory.v1', typeof chat?.userMemory === 'string' ? chat.userMemory : '');
    await AsyncStorage.setItem('watcher.chat.aiName.v1', typeof chat?.aiName === 'string' ? chat.aiName : 'Cine');
    await AsyncStorage.setItem('cloud_sync_revision', String(revision));
  } finally {
    applyingRemoteChanges = false;
  }
}

export async function pollCloudChanges(): Promise<void> {
  if (pollInFlight) return;
  const token = await cloudSync.getAuthToken();
  if (!token) return;
  pollInFlight = true;
  try {
    const revision = Number((await AsyncStorage.getItem('cloud_sync_revision')) || 0);
    const response = await axios.get(`${AUTH_API_BASE}/api/sync?since_revision=${revision}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 12000,
    });
    const nextRevision = Number(response.data?.revision || 0);
    if (!nextRevision || nextRevision === revision) return;
    const changes = response.data?.changes;
    if (response.data?.status === 'delta' && Array.isArray(changes) && changes.every((change: any) => change.type && change.action !== 'snapshot')) {
      applyingRemoteChanges = true;
      try {
        for (const change of changes) {
          const type = (change.type === 'favoriteArtists' ? 'artist' : change.type) as 'watchlist' | 'history' | 'artist';
          if (!['watchlist', 'history', 'artist'].includes(type)) continue;
          if (change.action === 'clear') clearSavedItems(type);
          else if (change.action === 'remove') removeSavedItem(Number(change.mediaId), type);
          else if (change.action === 'add' && change.item) addSavedItem(change.item, type);
        }
        for (const change of changes) {
          if (change.action === 'set' && change.type === 'preferences' && change.value) await setUserPreferences(change.value);
          if (change.action === 'set' && change.type === 'watchProgress' && change.value) await AsyncStorage.setItem('watch_progress_v1', JSON.stringify(change.value));
        }
        await AsyncStorage.setItem('cloud_sync_revision', String(nextRevision));
      } finally { applyingRemoteChanges = false; }
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

      await Promise.all([
        AsyncStorage.setItem('cloud_auth_token', token),
        AsyncStorage.setItem('cloud_auth_user', JSON.stringify(user)),
      ]);

      // Immediate sync upon login
      await this.syncWithCloud();

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

      await Promise.all([
        AsyncStorage.setItem('cloud_auth_token', token),
        AsyncStorage.setItem('cloud_auth_user', JSON.stringify(user)),
      ]);

      await this.syncWithCloud();

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
    await Promise.all([
      AsyncStorage.removeItem('cloud_auth_token'),
      AsyncStorage.removeItem('cloud_auth_user'),
      AsyncStorage.removeItem('last_cloud_sync_time'),
    ]);
  },

  /**
   * Full bi-directional sync with cloud
   */
  async syncWithCloud(): Promise<{ success: boolean; error?: string; message?: string }> {
    const token = await this.getAuthToken();
    if (!token) {
      return { success: false, error: 'Sign in to sync your library' };
    }

    try {
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
      const localPreferences = await getUserPreferences();
      
      const convStr = await AsyncStorage.getItem('watcher.chat.conversations.v1');
      const memStr = await AsyncStorage.getItem('watcher.chat.userMemory.v1');
      const aiNameStr = await AsyncStorage.getItem('watcher.chat.aiName.v1');

      // 2. Post to cloud sync endpoint
      const response = await axios.post(`${AUTH_API_BASE}/api/sync`, {
        watchlist: localWatchlist,
        history: localHistory,
        favoriteArtists: localArtists,
        preferences: localPreferences,
        aiChatData: {
          conversations: convStr ? JSON.parse(convStr) : [],
          userMemory: memStr || '',
          aiName: aiNameStr || 'Cine',
        },
        mode: 'merge',
      }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      });

      const merged = response.data?.library;
      if (!merged) {
        throw new Error('Sync response did not contain library data');
      }

      // 3. Write back missing cloud items into local SQLite database without echoing them
      applyingRemoteChanges = true;
      try {
      if (Array.isArray(merged.watchlist)) {
        merged.watchlist.forEach((item: any) => {
          if (item?.id) addSavedItem(item, 'watchlist');
        });
      }

      if (Array.isArray(merged.history)) {
        merged.history.forEach((item: any) => {
          if (item?.id) addSavedItem(item, 'history');
        });
      }

      if (Array.isArray(merged.favoriteArtists)) {
        merged.favoriteArtists.forEach((item: any) => {
          if (item?.id || item?.name) addSavedItem(item, 'artist');
        });
      }

      if (merged.preferences && typeof merged.preferences === 'object') {
        await setUserPreferences(merged.preferences);
      }

      const saveOps: Promise<void>[] = [];
      if (merged.aiChatData) {
        if (Array.isArray(merged.aiChatData.conversations)) {
          saveOps.push(AsyncStorage.setItem('watcher.chat.conversations.v1', JSON.stringify(merged.aiChatData.conversations)));
        }
        if (typeof merged.aiChatData.userMemory === 'string') {
          saveOps.push(AsyncStorage.setItem('watcher.chat.userMemory.v1', merged.aiChatData.userMemory));
        }
        if (typeof merged.aiChatData.aiName === 'string' && merged.aiChatData.aiName) {
          saveOps.push(AsyncStorage.setItem('watcher.chat.aiName.v1', merged.aiChatData.aiName));
        }
      }
      
      const syncTime = new Date().toISOString();
      saveOps.push(AsyncStorage.setItem('last_cloud_sync_time', syncTime));
      
      await Promise.all(saveOps);
      if (response.data?.revision) await AsyncStorage.setItem('cloud_sync_revision', String(response.data.revision));
      } finally {
        applyingRemoteChanges = false;
      }

      return { 
        success: true, 
        message: `Synced ${merged.watchlist?.length || 0} watchlist, ${merged.history?.length || 0} history items` 
      };
    } catch (err: any) {
      console.error('Mobile cloud sync error:', err?.response?.data || err.message);
      return { success: false, error: err?.response?.data?.error || err.message || 'Sync failed' };
    }
  },
};
