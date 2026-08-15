import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
dayjs.extend(isSameOrBefore);

import { getMediaDetails, fetchPersonalisedDiscoveryContent } from './tmdb';
import { getUserPreferences } from './userPreferences';

const BACKGROUND_FETCH_TASK = 'background-fetch-releases';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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

    // Helper to check if a release date is "upcoming" (within the next 14 days)
    const isUpcomingRelease = (dateObj: dayjs.Dayjs) => {
      return dateObj.isAfter(now) && dateObj.isSameOrBefore(now.add(14, 'day'));
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

        const upcomingKey = `upcoming_movie_${item.id}`;
        if (releaseDate && isUpcomingRelease(releaseDate) && !notifiedMediaIds.includes(upcomingKey)) {
          const daysAway = releaseDate.diff(now, 'day');
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `Coming to Theaters Soon 🍿`,
              body: `${item.title || item.name} releases in ${daysAway} days!`,
              data: { mediaId: item.id, mediaType: 'movie' },
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

    // Weekly 'For You' Picks
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

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const count = await executeNotificationCheck();
  return count > 0 ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.NoData;
});

export async function registerBackgroundFetchAsync() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    return;
  }

  return BackgroundTask.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 60 * 60 * 12, // 12 hours
  });
}
