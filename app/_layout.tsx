import React, { useEffect, useState } from 'react';
import { Platform, LogBox, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Brightness from 'expo-brightness';

import { isOnboardingComplete } from '@/src/userPreferences';
import * as Notifications from 'expo-notifications';
import { setupNotificationChannel, registerBackgroundFetchAsync, isNotificationsEnabled } from '@/src/notifications';

LogBox.ignoreLogs([
  'Method readAsStringAsync imported from "expo-file-system" is deprecated',
]);

SplashScreen.preventAutoHideAsync();


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

  // Initialize Smart Notifications and listener
  useEffect(() => {
    (async () => {
      try {
        await setupNotificationChannel();
        const enabled = await isNotificationsEnabled();
        if (enabled) {
          await registerBackgroundFetchAsync();
        }
      } catch (e) {
        console.log('Notification registration error:', e);
      }
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data;
      if (data?.mediaId) {
        const mediaType = data.mediaType || 'movie';
        router.push(`/movie/${data.mediaId}?media_type=${mediaType}`);
      }
    });

    return () => subscription.remove();
  }, [router]);

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
    async function checkOnboarding() {
      const complete = await isOnboardingComplete();
      setNeedsOnboarding(!complete);
      setIsReady(true);
    }
    checkOnboarding();
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
      </SafeAreaProvider>
  );
}
