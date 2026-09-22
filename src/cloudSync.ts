import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getSavedItems, addSavedItem } from './database';
import { getUserPreferences, setUserPreferences } from './userPreferences';

const AUTH_API_BASE = 'https://watcher-api-rho.vercel.app';

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
      // 1. Gather local SQLite items
      const localWatchlist = getSavedItems('watchlist') || [];
      const localHistory = getSavedItems('history') || [];
      const localArtists = getSavedItems('artist') || [];
      const localPreferences = await getUserPreferences();

      // 2. Post to cloud sync endpoint
      const response = await axios.post(`${AUTH_API_BASE}/api/sync`, {
        watchlist: localWatchlist,
        history: localHistory,
        favoriteArtists: localArtists,
        preferences: localPreferences,
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

      // 3. Write back missing cloud items into local SQLite database
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

      const syncTime = new Date().toISOString();
      await AsyncStorage.setItem('last_cloud_sync_time', syncTime);

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
