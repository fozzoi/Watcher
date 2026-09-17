import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getSavedItems } from './database';
import { getUserPreferences } from './userPreferences';

const WATCHER_API_BASE = 'https://watcher-api-rho.vercel.app';
const STORAGE_KEY_TOKEN = 'expo_push_token';

export const CHANNELS = {
  RELEASES: 'watcher-releases',
  UPDATES: 'watcher-updates',
};

export interface PushSubscriptionItem {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  release_date: string | null;
}

export interface PushSubscriptionPerson {
  id: number;
  name: string;
}

/** Contract for POST /api/push-token (backend release-notifications API). */
export interface PushTokenPayload {
  token: string;
  platform: string;
  watchlist: PushSubscriptionItem[];
  history: PushSubscriptionItem[];
  watched: PushSubscriptionItem[];
  favouritePeople: PushSubscriptionPerson[];
  country: string;
}

const toMediaSubscription = (item: any): PushSubscriptionItem => ({
  id: Number(item.id),
  media_type: item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie',
  title: item.title || item.name || '',
  release_date: item.release_date || item.first_air_date || null,
});

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
    });

    await Notifications.setNotificationChannelAsync(CHANNELS.UPDATES, {
      name: 'App Updates',
      description: 'Notifications when a new version or APK build is published',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
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
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
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
  } catch (error: any) {
    if (
      error?.message?.includes('FirebaseApp is not initialized') ||
      error?.message?.includes('googleServicesFile')
    ) {
      console.warn(
        '[Push] Android standalone builds require google-services.json for remote push notifications via FCM. See: https://docs.expo.dev/push-notifications/fcm-credentials/'
      );
    } else {
      console.error('[Push] Failed to get Expo push token:', error);
    }
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

    const watchlist = getSavedItems('watchlist').map(toMediaSubscription);
    const history = getSavedItems('history').map(toMediaSubscription);
    const preferences = await getUserPreferences();
    const favouritePeople = preferences.favoriteActors
      .filter((person) => Number.isFinite(Number(person.id)))
      .map((person) => ({ id: Number(person.id), name: person.name || '' }));

    const payload: PushTokenPayload = {
      token,
      platform: Platform.OS,
      watchlist,
      history,
      watched: history,
      favouritePeople,
      country: preferences.country,
    };

    await axios.post(
      `${WATCHER_API_BASE}/api/push-token`,
      payload,
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

export interface RemotePushTestResult {
  ticketId: string;
  token: string;
}

/**
 * Trigger an instant remote push test via the Expo Push API for this device.
 */
export async function sendTestRemotePushNotification(): Promise<RemotePushTestResult> {
  const token = await AsyncStorage.getItem(STORAGE_KEY_TOKEN);
  if (!token) {
    throw new Error('No push token found on this device. Please ensure permissions are granted.');
  }

  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error(`Android notification permission is ${permission.status}. Enable notifications for Watcher in system settings.`);
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

  const ticket = Array.isArray(response.data?.data)
    ? response.data.data[0]
    : response.data?.data;

  if (response.status < 200 || response.status >= 300 || ticket?.status !== 'ok' || !ticket?.id) {
    const details = ticket?.message || ticket?.details?.error || response.data?.errors?.[0]?.message;
    throw new Error(`Expo rejected the push ticket${details ? `: ${details}` : ` (HTTP ${response.status})`}`);
  }

  await AsyncStorage.setItem('last_push_test_ticket', JSON.stringify({
    ticketId: ticket.id,
    sentAt: new Date().toISOString(),
  }));

  return { ticketId: ticket.id, token };
}
