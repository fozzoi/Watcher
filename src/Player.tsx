import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, AppStateStatus, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { saveProgress } from '../src/utils/progress';

const SOURCES = [
  { name: 'VidSrc CC', url: 'https://vidsrc.cc/v2/embed' },
  { name: 'VidSrc TO', url: 'https://vidsrc.to/embed' },
  { name: '2Embed', url: 'https://www.2embed.cc/embed' },
];

const TIMEOUT_MS = 15000;

export default function Player() {
  const route = useRoute();
  const navigation = useNavigation();
  const { tmdbId, imdbId, mediaType, season, episode } = route.params;

  // --- STATE ---
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const timeoutRef = useRef(null);
  const appState = useRef(AppState.currentState);

  // --- AD BLOCKER & STYLE INJECTION ---
  const INJECTED_JS = `
    (function() {
      // 1. Block Popups
      window.open = function() { return null; };
      window.alert = function() { return null; };
      
      // 2. Force Dark Mode & Layout
      const style = document.createElement('style');
      style.innerHTML = \`
        html, body { background: #000; margin: 0; padding: 0; overflow: hidden; height: 100%; width: 100%; }
        iframe, video { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 1; border: none; outline: none; }
        
        /* 3. Hide annoying 3rd party controls if possible */
        .jw-control-bar, .vjs-control-bar, .plyr__controls { display: none !important; }
        
        /* 4. Aggressive Ad Removal */
        #ads, .ad, .advert, div[id^="ad"], iframe[src*="google"], iframe[src*="doubleclick"] { display: none !important; }
      \`;
      document.head.appendChild(style);
    })();
    true;
  `;

  useEffect(() => {
    // 1. Enter Landscape
    enterFullScreen();

    // 2. Handle App State (Background/Foreground)
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // 3. Handle Back Button (Exit Fullscreen before going back)
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      exitFullScreen().then(() => navigation.goBack());
      return true;
    });

    return () => {
      exitFullScreen();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      subscription.remove();
      backHandler.remove();
    };
  }, []);

  const enterFullScreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("hidden");
      await NavigationBar.setBehaviorAsync("overlay-swipe");
    }
    handleSaveProgress();
  };

  const exitFullScreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("visible");
    }
  };

  const handleAppStateChange = (nextAppState) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // Re-hide bars when returning to app
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

  const getStreamUrl = (sourceUrl) => {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const id = imdbId || tmdbId;
    const query = mediaType === 'tv' ? `/${season}/${episode}` : '';
    if (sourceUrl.includes('vidsrc')) {
        return mediaType === 'movie' ? `${sourceUrl}/movie/${id}` : `${sourceUrl}/tv/${id}/${season}/${episode}`;
    }
    return `${sourceUrl}/${type}/${id}${query}`;
  };

  return (
    <View style={styles.container}>
      {/* Force Status Bar Hidden */}
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
        userAgent="Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Mobile Safari/537.36"
        onShouldStartLoadWithRequest={(request) => {
            // Block ads/popups that try to open new windows
            const isStreamSource = SOURCES.some(s => request.url.includes(s.url.split('/')[2]));
            if (request.url.startsWith('http') && !request.url.includes('google') && !request.url.includes('facebook')) {
                return true;
            }
            return false;
        }}
        onLoadStart={() => {
            setLoading(true);
            // Auto-switch source if loading takes too long
            timeoutRef.current = setTimeout(() => {
                if (loading && currentSourceIndex < SOURCES.length - 1) {
                    console.log("Timeout: Switching Source");
                    setCurrentSourceIndex(prev => prev + 1);
                } else if (loading) {
                    setErrorMsg('Connection timed out');
                    setLoading(false);
                }
            }, TIMEOUT_MS);
        }}
        onLoadEnd={() => {
            setLoading(false);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        }}
        // Important: Transparent background to avoid white flashes
        containerStyle={{ backgroundColor: 'black' }} 
      />

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
             {errorMsg || `Loading Source ${currentSourceIndex + 1}...`}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
      flex: 1, 
      backgroundColor: 'black' 
  },
  webview: { 
      flex: 1, 
      backgroundColor: 'black',
  },
  loader: { 
      ...StyleSheet.absoluteFillObject, 
      backgroundColor: 'black', 
      justifyContent: 'center', 
      alignItems: 'center', 
      zIndex: 100 
  },
  loadingText: { 
      color: 'white', 
      marginTop: 15, 
      fontWeight: '600' 
  },
});