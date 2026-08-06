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
});

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const now = dayjs();
    const lastNotifiedStr = await AsyncStorage.getItem('lastNotifiedDate');
    const lastNotified = lastNotifiedStr ? dayjs(lastNotifiedStr) : now.subtract(1, 'day');

    const watchlistStr = await AsyncStorage.getItem('watchlist');
    const watchlist = watchlistStr ? JSON.parse(watchlistStr) : [];
    
    const historyStr = await AsyncStorage.getItem('history');
    const history = historyStr ? JSON.parse(historyStr) : [];

    let newNotifications = 0;

    // Check TV Shows in history for new episodes
    for (const item of history) {
      if (item.media_type === 'tv') {
        try {
          const details = await getMediaDetails('tv', item.id);
          const lastAirDate = details.last_air_date ? dayjs(details.last_air_date) : null;
          
          if (lastAirDate && lastAirDate.isAfter(lastNotified) && lastAirDate.isBefore(now.add(1, 'day'))) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: `New Episode: ${details.title || details.name}`,
                body: `A new episode aired on ${lastAirDate.format('MMM D, YYYY')}!`,
                data: { mediaId: item.id, mediaType: 'tv' },
              },
              trigger: null,
            });
            newNotifications++;
          }
        } catch (e) {
          console.error('Error fetching details for', item.id);
        }
      }
    }

    // Check Watchlist movies for recent releases
    for (const item of watchlist) {
      if (item.media_type === 'movie') {
        const releaseDate = item.release_date ? dayjs(item.release_date) : null;
        if (releaseDate && releaseDate.isAfter(lastNotified) && releaseDate.isBefore(now.add(1, 'day'))) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Watchlist Release!`,
              body: `${item.title || item.name} has just been released.`,
              data: { mediaId: item.id, mediaType: 'movie' },
            },
            trigger: null,
          });
          newNotifications++;
        }
      }
    }

    await AsyncStorage.setItem('lastNotifiedDate', now.toISOString());
    return newNotifications > 0 ? BackgroundFetch.BackgroundFetchResult.NewData : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    console.error(error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
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
