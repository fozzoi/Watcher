import { Platform } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrBefore);

import { getMediaDetails, fetchPersonalisedDiscoveryContent } from './tmdb';
import { getUserPreferences } from './userPreferences';
import { checkAndNotifyUpdate } from './updater';

const BACKGROUND_FETCH_TASK = 'background-fetch-releases';
const NOTIFS_ENABLED_KEY = 'smart_notifications_enabled';
const CHANNEL_ID = 'watcher-releases';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const setupNotificationChannel = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Releases & Recommendations',
      importance: Notifications.AndroidImportance.LOW,
    });
  }
};

export const isNotificationsEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem(NOTIFS_ENABLED_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
};

export const setNotificationsEnabled = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(NOTIFS_ENABLED_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    await registerBackgroundFetchAsync();
  } else {
    await unregisterBackgroundFetchAsync();
  }
};

export const executeNotificationCheck = async () => {
  try {
    // Check for App Updates in background
    try {
      await checkAndNotifyUpdate();
    } catch (e) {
      console.log('Background update check error:', e);
    }

    const enabled = await isNotificationsEnabled();
    if (!enabled) return 0;

    await setupNotificationChannel();
    const now = dayjs();

    let watchlist: any[] = [];
    try {
      const watchlistStr = await AsyncStorage.getItem('watchlist');
      watchlist = watchlistStr ? JSON.parse(watchlistStr) : [];
    } catch (e) {
      console.error('Failed to parse watchlist for notifications');
    }
    
    let history: any[] = [];
    try {
      const historyStr = await AsyncStorage.getItem('history');
      history = historyStr ? JSON.parse(historyStr) : [];
    } catch (e) {
      console.error('Failed to parse history for notifications');
    }

    let notifiedMediaIds: string[] = [];
    try {
      const notifiedStr = await AsyncStorage.getItem('notifiedMediaIds');
      notifiedMediaIds = notifiedStr ? JSON.parse(notifiedStr) : [];
    } catch (e) {
      console.error('Failed to parse notifiedMediaIds');
    }

    let newNotifications = 0;

    // Helper to check if a release date is "recent" (within the last 7 days or today)
    const isRecentRelease = (dateObj: dayjs.Dayjs) => {
      return dateObj.isAfter(now.subtract(7, 'day')) && dateObj.isSameOrBefore(now.add(1, 'day'));
    };

    // Helper to check if a release date is "upcoming" (within the next 14 days)
    const isUpcomingRelease = (dateObj: dayjs.Dayjs) => {
      return dateObj.isAfter(now) && dateObj.isSameOrBefore(now.add(14, 'day'));
    };

    // 1. Check TV Shows in history/watchlist for new episodes
    const tvItems = [...history, ...watchlist].filter(i => i.media_type === 'tv' || i.first_air_date);
    const uniqueTvItems = Array.from(new Map(tvItems.map(item => [item.id, item])).values());

    for (const item of uniqueTvItems) {
      try {
        const details = await getMediaDetails(item.id, 'tv');
        const lastAirDateStr = (details as any).last_air_date;
        if (lastAirDateStr) {
          const lastAirDate = dayjs(lastAirDateStr);
          const notifyKey = `tv_${item.id}_${lastAirDateStr}`;

          if (isRecentRelease(lastAirDate) && !notifiedMediaIds.includes(notifyKey)) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: `New Episode: ${details.title || details.name}`,
                body: `A new episode aired on ${lastAirDate.format('MMM D, YYYY')}!`,
                data: { mediaId: item.id, mediaType: 'tv' },
                ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
              },
              trigger: null,
            });
            notifiedMediaIds.push(notifyKey);
            newNotifications++;
          }
        }
      } catch (e) {
        console.error('Error fetching details for TV show', item.id);
      }
    }

    // 2. Check Watchlist Movies & Collections
    for (const item of watchlist) {
      if (item.media_type === 'movie' || (!item.first_air_date && item.media_type !== 'collection')) {
        const releaseDate = item.release_date ? dayjs(item.release_date) : null;
        const notifyKey = `movie_${item.id}`;

        if (releaseDate && isRecentRelease(releaseDate) && !notifiedMediaIds.includes(notifyKey)) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Watchlist Release! 🎬`,
              body: `${item.title || item.name} is now released. Tap to watch.`,
              data: { mediaId: item.id, mediaType: 'movie' },
              ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
            },
            trigger: null,
          });
          notifiedMediaIds.push(notifyKey);
          newNotifications++;
        }

        const upcomingKey = `upcoming_movie_${item.id}`;
        if (releaseDate && isUpcomingRelease(releaseDate) && !notifiedMediaIds.includes(upcomingKey)) {
          const daysAway = releaseDate.diff(now, 'day');
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Premiere Soon 🍿`,
              body: `${item.title || item.name} releases in ${daysAway} days (${releaseDate.format('MMM D')})!`,
              data: { mediaId: item.id, mediaType: 'movie' },
              ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
            },
            trigger: null,
          });
          notifiedMediaIds.push(upcomingKey);
          newNotifications++;
        }
      } else if (item.media_type === 'collection') {
        if (item.parts && Array.isArray(item.parts)) {
          for (const part of item.parts) {
            const partReleaseDate = part.release_date ? dayjs(part.release_date) : null;
            const notifyKey = `collection_part_${part.id}`;

            if (partReleaseDate && isRecentRelease(partReleaseDate) && !notifiedMediaIds.includes(notifyKey)) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `New in ${item.name}! 🌟`,
                  body: `${part.title} is now out.`,
                  data: { mediaId: part.id, mediaType: 'movie' },
                  ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
                },
                trigger: null,
              });
              notifiedMediaIds.push(notifyKey);
              newNotifications++;
            }
          }
        }
      }
    }

    try {
      if (notifiedMediaIds.length > 500) {
        notifiedMediaIds = notifiedMediaIds.slice(notifiedMediaIds.length - 500);
      }
      await AsyncStorage.setItem('notifiedMediaIds', JSON.stringify(notifiedMediaIds));
    } catch (e) {
      console.error('Failed to save notifiedMediaIds');
    }

    // 3. Weekly Personalised Picks
    try {
      const lastWeeklyStr = await AsyncStorage.getItem('last_weekly_foryou');
      const lastWeekly = lastWeeklyStr ? dayjs(lastWeeklyStr) : dayjs(0);
      
      if (now.diff(lastWeekly, 'day') >= 7) {
        const prefs = await getUserPreferences();
        const content = await fetchPersonalisedDiscoveryContent(prefs.languages, prefs.genreIds, 0, false);
        
        if (content && content.trendingMovies && content.trendingMovies.length > 0) {
          const topPick = content.trendingMovies[0];
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Your Weekly Pick 🌟`,
              body: `Based on your taste, you might love ${topPick.title}!`,
              data: { mediaId: topPick.id, mediaType: 'movie' },
              ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
            },
            trigger: null,
          });
          await AsyncStorage.setItem('last_weekly_foryou', now.toISOString());
          newNotifications++;
        }
      }
    } catch (e) {
      console.error('Failed to generate weekly for you pick');
    }

    return newNotifications;
  } catch (error) {
    console.error(error);
    return 0;
  }
};

// Define Background Task
try {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    try {
      const count = await executeNotificationCheck();
      return count > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
} catch (e) {
  console.log('TaskManager task definition error:', e);
}

export async function registerBackgroundFetchAsync() {
  try {
    await setupNotificationChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
        minimumInterval: 60 * 60 * 6, // 6 hours
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    console.error('Error registering background fetch task:', e);
  }
}

export async function unregisterBackgroundFetchAsync() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    }
  } catch (e) {
    console.error('Failed to unregister background fetch task', e);
  }
}

export const sendTestNotification = async () => {
  await setupNotificationChannel();
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Notification permissions not granted.');
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Watcher Smart Alert 🍿',
      body: 'Notifications are active! You will receive alerts when new episodes or movie releases arrive.',
      data: { mediaId: 27205, mediaType: 'movie' },
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: null,
  });
};
