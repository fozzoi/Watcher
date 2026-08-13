import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { getMediaDetails } from './tmdb';

const BACKGROUND_FETCH_TASK = 'background-fetch-releases';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
export const executeNotificationCheck = async () => {
  try {
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

    // Check TV Shows in history for new episodes
    for (const item of history) {
      if (item.media_type === 'tv') {
        try {
          const details = await getMediaDetails('tv', item.id);
          const lastAirDateStr = details.last_air_date;
          if (lastAirDateStr) {
            const lastAirDate = dayjs(lastAirDateStr);
            const notifyKey = `tv_${item.id}_${lastAirDateStr}`; // Unique key per episode air date

            if (isRecentRelease(lastAirDate) && !notifiedMediaIds.includes(notifyKey)) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `New Episode: ${details.title || details.name}`,
                  body: `A new episode aired on ${lastAirDate.format('MMM D, YYYY')}!`,
                  data: { mediaId: item.id, mediaType: 'tv' },
                },
                trigger: null,
              });
              notifiedMediaIds.push(notifyKey);
              newNotifications++;
            }
          }
        } catch (e) {
          console.error('Error fetching details for', item.id);
        }
      }
    }

    // Check Watchlist items (Movies & Collections)
    for (const item of watchlist) {
      if (item.media_type === 'movie') {
        const releaseDate = item.release_date ? dayjs(item.release_date) : null;
        const notifyKey = `movie_${item.id}`;

        if (releaseDate && isRecentRelease(releaseDate) && !notifiedMediaIds.includes(notifyKey)) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Watchlist Release!`,
              body: `${item.title || item.name} has just been released.`,
              data: { mediaId: item.id, mediaType: 'movie' },
            },
            trigger: null,
          });
          notifiedMediaIds.push(notifyKey);
          newNotifications++;
        }
      } else if (item.media_type === 'collection') {
        if (item.parts && Array.isArray(item.parts)) {
          for (const part of item.parts) {
            const partReleaseDate = part.release_date ? dayjs(part.release_date) : null;
            const notifyKey = `movie_${part.id}`; // Parts are movies

            if (partReleaseDate && isRecentRelease(partReleaseDate) && !notifiedMediaIds.includes(notifyKey)) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: `New in ${item.name}!`,
                  body: `${part.title} is now out.`,
                  data: { mediaId: item.id, mediaType: 'collection' },
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
      // Keep only the last 500 keys to avoid blowing up storage over years
      if (notifiedMediaIds.length > 500) {
        notifiedMediaIds = notifiedMediaIds.slice(notifiedMediaIds.length - 500);
      }
      await AsyncStorage.setItem('notifiedMediaIds', JSON.stringify(notifiedMediaIds));
    } catch (e) {
      console.error('Failed to save notifiedMediaIds');
    }

    return newNotifications;
  } catch (error) {
    console.error(error);
    return 0;
  }
};

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const count = await executeNotificationCheck();
  return count > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
});

export async function registerBackgroundFetchAsync() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  return BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 60 * 60 * 12, // 12 hours
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
