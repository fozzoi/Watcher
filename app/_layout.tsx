import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { registerRootComponent } from "expo";
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Brightness from 'expo-brightness';
import { ThemeProvider, DarkTheme } from '@react-navigation/native'; // ✅ Imported ThemeProvider
import AppNavigator from "./AppNavigator";

SplashScreen.preventAutoHideAsync();

// ✅ Moved our custom theme here
const MyTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#141414', 
  },
};

function RootLayout() {
  const [fontsLoaded] = useFonts({
    'GoogleSansFlex-Regular': require('../assets/fonts/GoogleSansFlex-Regular.ttf'),
    'GoogleSansFlex-Medium': require('../assets/fonts/GoogleSansFlex-Medium.ttf'),
    'GoogleSansFlex-Bold': require('../assets/fonts/GoogleSansFlex-Bold.ttf'),
  });

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
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    // ✅ Wrapped in ThemeProvider to pass the theme to Expo Router
    <ThemeProvider value={MyTheme}>
      <SafeAreaProvider style={{ flex: 1, backgroundColor: '#141414' }}>
        <AppNavigator />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default RootLayout;

registerRootComponent(RootLayout);