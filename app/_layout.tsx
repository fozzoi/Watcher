import React, { useEffect, useState } from 'react';
import { Platform, LogBox, View, ActivityIndicator, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as Brightness from 'expo-brightness';
import { Image as ExpoImage } from 'expo-image';

import { isOnboardingComplete } from '@/src/userPreferences';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { setupNotificationChannel, registerBackgroundFetchAsync, isNotificationsEnabled } from '@/src/notifications';
import { registerForPushNotificationsAsync, syncPushTokenAndWatchlist } from '@/src/pushNotifications';
import { checkAndNotifyUpdate, UpdateCheckResult } from '@/src/updater';
import AppUpdateModal from '@/src/components/shared/AppUpdateModal';
import { initDb, performMigration, getSavedItems, getAiEmbedding, insertAiEmbedding, setOnSavedItemsChangedListener } from '@/src/database';
import { loadGlobalConfig, GLOBAL_CONFIG, fetchEmbeddingsBatch } from '@/src/tmdb';
import { pollCloudChanges, prepareCloudSessionOnStartup, queueCloudMutation } from '@/src/cloudSync';

// Disable non-critical warnings
LogBox.ignoreLogs([
  'Method readAsStringAsync imported from "expo-file-system" is deprecated',
  'ProgressBarAndroid has been extracted',
  'SafeAreaView has been deprecated',
  'Clipboard has been extracted',
  'PushNotificationIOS has been extracted',
]);
SplashScreen.preventAutoHideAsync();

const performAiBackgroundSync = async () => {
  if (!GLOBAL_CONFIG.aiEnabled) return;
  try {
    const watchlist = getSavedItems('watchlist');
    const missingItems = [];
    
    // 1. Instantly scan for missing embeddings locally
    for (let i = 0; i < watchlist.length; i++) {
      if (!getAiEmbedding(watchlist[i].id)) {
        missingItems.push(watchlist[i]);
      }
    }
    
    // 2. Batch process missing items (100 at a time) to dramatically reduce API requests
    const chunkSize = 100;
    for (let i = 0; i < missingItems.length; i += chunkSize) {
      const chunk = missingItems.slice(i, i + chunkSize);
      
      const textsToEmbed = chunk.map((item: any) => {
        const title = item.title || item.name || '';
        const type = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        let text = `Title: ${title}\nType: ${type}`;
        if (item.overview) text += `\nOverview: ${item.overview}`;
        return text;
      });

      const embeddings = await fetchEmbeddingsBatch(textsToEmbed);
      if (embeddings && embeddings.length === chunk.length) {
        chunk.forEach((item, index) => {
          insertAiEmbedding(item.id, embeddings[index]);
        });
      }
      
      if (i + chunkSize < missingItems.length) {
        await new Promise(res => setTimeout(res, 500));
      }
    }
  } catch (e) {
    console.log("Background AI Sync failed silently:", e);
  }
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const [isReady, setIsReady] = useState(false);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // App Update state
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Initialize Remote Push Notifications and listener
  useEffect(() => {
    if (!isReady || !databaseReady) return;
    (async () => {
      try {
        await setupNotificationChannel();
        // Register for remote push notifications (Expo Push Token) & initial sync
        await registerForPushNotificationsAsync();

        const enabled = await isNotificationsEnabled();
        if (enabled) {
          await registerBackgroundFetchAsync();
        }
      } catch (e) {
        console.log('Notification registration error:', e);
      }
    })();

    // Automatically sync watchlist to remote server whenever changed
    setOnSavedItemsChangedListener((mutation) => {
      syncPushTokenAndWatchlist().catch((err) =>
        console.log('Watchlist push sync error:', err)
      );
      queueCloudMutation(mutation);
    });

    const syncIfActive = () => {
      if (AppState.currentState === 'active') pollCloudChanges();
    };
    const syncTimer = setInterval(syncIfActive, 150000);
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') pollCloudChanges();
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data: any = response?.notification?.request?.content?.data;
      if (data?.isAppUpdate) {
        if (data?.releaseInfo) {
          setUpdateResult(data.releaseInfo);
        } else if (data?.version) {
          setUpdateResult({
            updateAvailable: true,
            currentVersion: Constants.expoConfig?.version || '3.0.0',
            latestVersion: String(data.version),
            releaseName: data.releaseName || `The Watcher ${data.version}`,
            releaseNotes: 'Tap Download to install the latest build.',
            publishedAt: new Date().toISOString(),
            apkUrl: data.apkUrl || null,
            apkSize: 0,
          });
        }
        setShowUpdateModal(true);
      } else if (data?.mediaId) {
        const mediaType = data.mediaType || 'movie';
        router.push(`/movie/${data.mediaId}?media_type=${mediaType}`);
      } else if (typeof data?.url === 'string') {
        router.push(data.url as any);
      }
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) {
          const data: any = response.notification.request.content.data;
          if (data?.mediaId) {
            router.push(`/movie/${data.mediaId}?media_type=${data.mediaType || 'movie'}`);
          } else if (typeof data?.url === 'string') {
            router.push(data.url as any);
          }
        }
      })
      .catch((error) => console.warn('Failed to handle initial notification:', error));

    return () => {
      subscription.remove();
      clearInterval(syncTimer);
      appStateSubscription.remove();
      setOnSavedItemsChangedListener(null);
    };
  }, [router, isReady, databaseReady]);

  // Check for app updates on launch
  useEffect(() => {
    if (!isReady) return;
    const checkUpdates = async () => {
      try {
        const update = await checkAndNotifyUpdate();
        if (update && update.updateAvailable) {
          setUpdateResult(update);
          setShowUpdateModal(true);
        }
      } catch (e) {
        console.log('Update check error on startup:', e);
      }
    };
    checkUpdates();
  }, [isReady]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        try {
          const { status } = await Brightness.getPermissionsAsync();
          if (status !== 'granted') {
            const { status: newStatus } = await Brightness.requestPermissionsAsync();
            if (newStatus !== 'granted') {
              console.log("Brightness permission denied");
            }
          }
        } catch (e) {
          console.log("Error requesting brightness permission:", e);
        }
      }
    })();
  }, []);

  useEffect(() => {
    async function initializeApp() {
      try {
        initDb();
        await performMigration();
        await loadGlobalConfig();
        setDatabaseReady(true);
        // Non-blocking background sync
        prepareCloudSessionOnStartup().catch((e) => console.warn('Cloud session warning:', e));
        if (GLOBAL_CONFIG.aiEnabled) {
          performAiBackgroundSync().catch(() => {});
        }
      } catch (e) {
        console.error('Database init failed:', e);
      }

      try {
        const complete = await isOnboardingComplete();
        setNeedsOnboarding(!complete);
      } catch (e) {
        setNeedsOnboarding(false);
      }
      setIsReady(true);
    }
    initializeApp();
  }, []);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  

  // Release decoded native image cache to Android OS whenever app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background') {
        ExpoImage.clearMemoryCache().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Initial routing for first-time onboarding (only on cold start)
  const initialRedirectDone = React.useRef(false);
  useEffect(() => {
    if (!isReady || initialRedirectDone.current) return;
    initialRedirectDone.current = true;

    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding, isReady]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: '#141414' }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#141414' },
          animationDuration: 280,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="stats" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="movie/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="cast/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="collection/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="viewall" options={{ presentation: 'card' }} />
      </Stack>

      <AppUpdateModal
        visible={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateResult={updateResult}
      />
    </SafeAreaProvider>
  );
}
