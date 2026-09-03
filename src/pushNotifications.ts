import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getSavedItems } from './database';

const WATCHER_API_BASE = 'https://watcher-api-rho.vercel.app';
const STORAGE_KEY_TOKEN = 'expo_push_token';

export const CHANNELS = {
  RELEASES: 'watcher-releases',
  UPDATES: 'watcher-updates',
};

/**
 * Configure dedicated notification channels for Android.
 * watcher-releases: For OTT releases, theater premieres, and new episodes.
 * watcher-updates: For app updates and APK releases.
 */
export async function setupPushNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNELS.RELEASES, {
      name: 'Releases & Episodes',
      description: 'Notifications for new OTT releases, theater premieres, and episodes',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.UPDATES, {
      name: 'App Updates',
      description: 'Notifications when a new version or APK build is published',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
      sound: 'default',
    });
  }
}

/**
 * Registers this device for Expo remote push notifications,
 * retrieves the ExpoPushToken, and caches it locally.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  await setupPushNotificationChannels();

  if (!Device.isDevice) {
    console.log('[Push] Must use physical device for remote push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Permission for notifications was denied');
    return null;
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId ??
      'a208162b-f69c-4bc1-969b-d670ee577a01';

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenResponse.data;
    await AsyncStorage.setItem(STORAGE_KEY_TOKEN, token);

    // Initial sync with backend
    await syncPushTokenAndWatchlist(token);

    return token;
  } catch (error) {
    console.error('[Push] Failed to get Expo push token:', error);
    return null;
  }
}

/**
 * Syncs the device token and current watchlist with the backend MongoDB.
 */
export async function syncPushTokenAndWatchlist(tokenOverride?: string): Promise<boolean> {
  try {
    const token = tokenOverride || (await AsyncStorage.getItem(STORAGE_KEY_TOKEN));
    if (!token) {
      return false;
    }

    let watchlist: any[] = [];
    try {
      watchlist = getSavedItems('watchlist');
    } catch {
      watchlist = [];
    }

    const payloadWatchlist = watchlist.map((item) => ({
      id: item.id,
      media_type: item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie',
      title: item.title || item.name || '',
      release_date: item.release_date || item.first_air_date || null,
    }));

    await axios.post(
      `${WATCHER_API_BASE}/api/push-token`,
      {
        token,
        platform: Platform.OS,
        watchlist: payloadWatchlist,
      },
      { timeout: 8000 }
    );

    return true;
  } catch (error: any) {
    console.warn('[Push] Failed to sync push token/watchlist:', error?.message);
    return false;
  }
}

/**
 * Returns the cached Expo Push Token if already generated.
 */
export async function getCachedPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_TOKEN);
}

/**
 * Trigger an instant remote push test via the Expo Push API for this device.
 */
export async function sendTestRemotePushNotification(): Promise<boolean> {
  const token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) {
    throw new Error('No push token found on this device. Please ensure permissions are granted.');
  }

  const response = await axios.post(
    'https://exp.host/--/api/v2/push/send',
    {
      to: token,
      sound: 'default',
      title: 'Watcher Remote Push Test 🍿',
      body: 'Remote push notifications are connected! You will now receive alerts when closed.',
      data: { mediaId: 27205, mediaType: 'movie' },
      channelId: CHANNELS.RELEASES,
    },
    {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    }
  );

  return response.status === 200;
}
