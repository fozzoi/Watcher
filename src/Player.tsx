import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar'; // Use Expo Status Bar
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';
import * as NavigationBar from 'expo-navigation-bar'; // ✅ IMPORT THIS
import { PanGestureHandler, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, withSequence, withDelay } from 'react-native-reanimated';
import { saveProgress } from '../src/utils/progress';

const SOURCES = [
  { name: 'VidSrc CC', url: 'https://vidsrc.cc/v2/embed' },
  { name: 'VidSrc TO', url: 'https://vidsrc.to/embed' },
  { name: '2Embed', url: 'https://www.2embed.cc/embed' },
];

const TIMEOUT_MS = 15000; 

export default function Player() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { tmdbId, imdbId, mediaType, season, episode } = route.params as any;

  // --- STATE ---
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  // --- REANIMATED VALUES ---
  const brightness = useSharedValue(0.5);
  const volume = useSharedValue(0.5);
  const showIndicator = useSharedValue(0);
  const indicatorType = useSharedValue<'brightness' | 'volume'>('brightness');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState); // ✅ Track App State

  const INJECTED_JS = `
    (function() {
      window.open = function() { return null; };
      window.alert = function() { return null; };
      const style = document.createElement('style');
      style.innerHTML = \`
        html, body { background: #000; margin: 0; padding: 0; overflow: hidden; }
        iframe, video { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1; border: none; }
        .jw-control-bar, .vjs-control-bar, .plyr__controls { z-index: 9999 !important; }
        #ads, .ad, .advert, div[id^="ad"], iframe[src*="google"], iframe[src*="doubleclick"] { display: none !important; }
      \`;
      document.head.appendChild(style);
    })();
    true;
  `;

  useEffect(() => {
    // 1. Initial Setup
    enterFullScreen();
    
    // 2. Listen for App Background/Foreground changes
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // 3. Cleanup on exit
      exitFullScreen();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      subscription.remove();
    };
  }, []);

  // ✅ FORCE IMMERSIVE MODE FUNCTION
  const enterFullScreen = async () => {
    // 1. Lock Landscape
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    
    // 2. Android: Hide Bottom Gesture Bar & Top Status Bar
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("hidden");
      await NavigationBar.setBehaviorAsync("overlay-swipe"); // Swipe up to see bars temporarily
    }

    // 3. Restore Brightness settings if needed
    const { status } = await Brightness.requestPermissionsAsync();
    if (status === 'granted') {
        const cur = await Brightness.getBrightnessAsync();
        brightness.value = cur;
    }
    handleSaveProgress();
  };

  // ✅ EXIT IMMERSIVE MODE FUNCTION
  const exitFullScreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("visible");
    }
    await Brightness.restoreSystemBrightnessAsync();
  };

  // ✅ HANDLE APP SWITCHING (WhatsApp -> Player)
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (
      appState.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      // App has come to the foreground! Force hide bars again.
      if (Platform.OS === 'android') {
         NavigationBar.setVisibilityAsync("hidden");
      }
    }
    appState.current = nextAppState;
  };

  const handleSaveProgress = async () => {
    await saveProgress({
      tmdbId, mediaType, lastSeason: season || 1, lastEpisode: episode || 1,
      position: 0, duration: 0, updatedAt: Date.now()
    });
  };

  const getStreamUrl = (sourceUrl: string) => {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const id = imdbId || tmdbId;
    const query = mediaType === 'tv' ? `/${season}/${episode}` : '';
    if (sourceUrl.includes('vidsrc')) {
        return mediaType === 'movie' ? `${sourceUrl}/movie/${id}` : `${sourceUrl}/tv/${id}/${season}/${episode}`;
    }
    return `${sourceUrl}/${type}/${id}${query}`;
  };

  // --- GESTURE LOGIC (Unchanged) ---
  const updateSystemBrightness = (val: number) => { Brightness.setBrightnessAsync(val); };

  const onGestureEvent = (type: 'brightness' | 'volume') => (event: any) => {
    'worklet';
    const delta = -event.velocityY / 10000;
    if (type === 'brightness') {
        const newVal = Math.min(1, Math.max(0, brightness.value + delta));
        brightness.value = newVal;
        indicatorType.value = 'brightness';
        runOnJS(updateSystemBrightness)(newVal);
    } else {
        const newVal = Math.min(1, Math.max(0, volume.value + delta));
        volume.value = newVal;
        indicatorType.value = 'volume';
    }
    showIndicator.value = 1;
    showIndicator.value = withSequence(withTiming(1, { duration: 100 }), withDelay(1500, withTiming(0)));
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: showIndicator.value,
    transform: [{ scale: withTiming(showIndicator.value ? 1 : 0.8) }]
  }));

  const onShouldStartLoadWithRequest = (request: any) => {
    if (request.url.startsWith('http') && !request.url.includes('google') && !request.url.includes('facebook')) {
        return true;
    }
    return false;
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* ✅ Expo Status Bar Component - Force Hidden */}
      <StatusBar hidden={true} />
      
      <WebView
        key={currentSourceIndex}
        source={{ uri: getStreamUrl(SOURCES[currentSourceIndex].url) }}
        style={styles.webview}
        injectedJavaScript={INJECTED_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        setSupportMultipleWindows={false} 
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        userAgent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        onLoadStart={() => {
            setLoading(true);
            timeoutRef.current = setTimeout(() => {
                if(loading) {
                    if (currentSourceIndex < SOURCES.length - 1) {
                        setCurrentSourceIndex(i => i + 1);
                    } else {
                        setErrorMsg('No sources found');
                        setLoading(false);
                    }
                }
            }, TIMEOUT_MS);
        }}
        onLoadEnd={() => {
            setLoading(false);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }}
      />

      <PanGestureHandler onGestureEvent={onGestureEvent('brightness')}>
        <Animated.View style={styles.gestureZoneLeft} />
      </PanGestureHandler>

      <PanGestureHandler onGestureEvent={onGestureEvent('volume')}>
        <Animated.View style={styles.gestureZoneRight} />
      </PanGestureHandler>

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
             {errorMsg || `Loading Source ${currentSourceIndex + 1}...`}
          </Text>
        </View>
      )}

      <Animated.View style={[styles.feedbackContainer, indicatorStyle]} pointerEvents="none">
         <IndicatorIcon type={indicatorType} brightness={brightness} volume={volume} />
      </Animated.View>

    </GestureHandlerRootView>
  );
}

// ... Keep your IndicatorIcon, AnimatedIcon, AnimatedBar and styles exactly as they were ...
const IndicatorIcon = ({ type, brightness, volume }: any) => {
    return (
        <View style={{ alignItems: 'center' }}>
             <AnimatedIcon type={type} />
             <AnimatedBar type={type} brightness={brightness} volume={volume} />
        </View>
    );
};

const AnimatedIcon = ({ type }: any) => {
    return <MaterialCommunityIcons name="brightness-6" size={40} color="#E50914" />;
};

const AnimatedBar = ({ type, brightness, volume }: any) => {
    const style = useAnimatedStyle(() => {
        const val = type.value === 'brightness' ? brightness.value : volume.value;
        return { width: `${Math.round(val * 100)}%` };
    });
    return (
        <View style={{ width: 100, alignItems: 'center' }}>
            <View style={styles.progressBarBg}>
                <Animated.View style={[styles.progressBarFill, style]} />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'black' },
  gestureZoneLeft: { position: 'absolute', left: 0, top: 50, bottom: 50, width: 80, zIndex: 99, backgroundColor: 'transparent' },
  gestureZoneRight: { position: 'absolute', right: 0, top: 50, bottom: 50, width: 80, zIndex: 99, backgroundColor: 'transparent' },
  loader: { ...StyleSheet.absoluteFillObject, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  loadingText: { color: 'white', marginTop: 15, fontWeight: '600', fontFamily: 'GoogleSansFlex-Medium' },
  feedbackContainer: { 
      position: 'absolute', 
      alignSelf: 'center', 
      top: '40%', 
      backgroundColor: 'rgba(0,0,0,0.85)', 
      padding: 25, 
      borderRadius: 16, 
      alignItems: 'center', 
      justifyContent: 'center', 
      zIndex: 200, 
      minWidth: 140 
  },
  progressBarBg: { width: 100, height: 6, backgroundColor: '#333', borderRadius: 3, marginTop: 15, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#E50914', borderRadius: 3 }
});