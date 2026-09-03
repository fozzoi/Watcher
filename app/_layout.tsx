import React, { useEffect, useState } from 'react';
import { Platform, LogBox, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Brightness from 'expo-brightness';

import { isOnboardingComplete } from '@/src/userPreferences';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { setupNotificationChannel, registerBackgroundFetchAsync, isNotificationsEnabled } from '@/src/notifications';
import { registerForPushNotificationsAsync, syncPushTokenAndWatchlist } from '@/src/pushNotifications';
import { checkAndNotifyUpdate, UpdateCheckResult } from '@/src/updater';
import AppUpdateModal from '@/src/components/shared/AppUpdateModal';
import { initDb, performMigration, getSavedItems, getAiEmbedding, insertAiEmbedding, setOnWatchlistChangedListener } from '@/src/database';
import { fetchEmbedding, fetchEmbeddingsBatch } from '@/src/tmdb';

// Disable non-critical warnings
LogBox.ignoreLogs([
  'Method readAsStringAsync imported from "expo-file-system" is deprecated',
  'ProgressBarAndroid has been extracted',
  'SafeAreaView has been deprecated',
  'Clipboard has been extracted',
  'PushNotificationIOS has been extracted',
]);

import { enableFreeze } from 'react-native-screens';

SplashScreen.preventAutoHideAsync();

// Globally freeze inactive screens across the entire app for massive performance boosts
enableFreeze(true);

const performAiBackgroundSync = async () => {
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

  const [fontsLoaded] = useFonts({
    'GoogleSansFlex-Regular': require('../assets/fonts/GoogleSansFlex-Regular.ttf'),
    'GoogleSansFlex-Medium': require('../assets/fonts/GoogleSansFlex-Medium.ttf'),
    'GoogleSansFlex-Bold': require('../assets/fonts/GoogleSansFlex-Bold.ttf'),
  });

  const [isReady, setIsReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // App Update state
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Initialize Remote Push Notifications and listener
  useEffect(() => {
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
    setOnWatchlistChangedListener(() => {
      syncPushTokenAndWatchlist().catch((err) =>
        console.log('Watchlist push sync error:', err)
      );
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data;
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
      }
    });

    return () => {
      subscription.remove();
      setOnWatchlistChangedListener(null);
    };
  }, [router]);

  // Check for app updates on launch
  useEffect(() => {
    if (!isReady || !fontsLoaded) return;
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
  }, [isReady, fontsLoaded]);

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
        
        // Fire and forget silent background AI embedding sync for existing users
        performAiBackgroundSync();
      } catch (e) {
        console.error('Database init failed:', e);
      }

      const complete = await isOnboardingComplete();
      setNeedsOnboarding(!complete);
      setIsReady(true);
    }
    initializeApp();
  }, []);

  useEffect(() => {
    if (fontsLoaded && isReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isReady]);

  // Initial routing for first-time onboarding (only on cold start)
  const initialRedirectDone = React.useRef(false);
  useEffect(() => {
    if (!isReady || !fontsLoaded || initialRedirectDone.current) return;
    initialRedirectDone.current = true;

    if (needsOnboarding) {
      router.replace('/onboarding');
    }
  }, [needsOnboarding, isReady, fontsLoaded]);

  if (!fontsLoaded || !isReady) {
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
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="player" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="stats" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="movie/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="cast/[id]" options={{ presentation: 'card' }} />
        <Stack.Screen name="collection/[id]" options={{ presentation: 'card' }} />
      </Stack>

      <AppUpdateModal
        visible={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateResult={updateResult}
      />
    </SafeAreaProvider>
  );
}
