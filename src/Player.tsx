import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { saveProgress } from '../src/utils/progress';
import { STREAM_SOURCES, makeStreamUrl } from '../src/utils/sources';

// --- CUSTOM TOAST COMPONENT ---
const SourceToast = ({ sourceName, visible }: { sourceName: string, visible: boolean }) => {
  if (!visible) return null;
  return (
    <View style={styles.toastContainer}>
      <Text style={styles.toastText}>Playing from: {sourceName}</Text>
    </View>
  );
};

export default function Player() {
  const route = useRoute();
  const navigation = useNavigation();
  const { tmdbId, imdbId, mediaType, season, episode, startIndex = 0 } = route.params as any;

  const [currentSourceIndex, setCurrentSourceIndex] = useState(startIndex);
  const [loading, setLoading] = useState(true);
  
  // Toast State
  const [showToast, setShowToast] = useState(false);
  
  const appState = useRef(AppState.currentState);

  // --- STRICT AD BLOCKER ---
  const INJECTED_JS = `
    (function() {
      window.open = function() { return null; };
      window.alert = function() { return null; };
      window.confirm = function() { return null; };
      
      const style = document.createElement('style');
      style.innerHTML = \`
        html, body { background: #000; margin: 0; padding: 0; overflow: hidden; height: 100vh; width: 100vw; }
        iframe, video { position: fixed; top: 0; left: 0; width: 100%; height: 100%; border: none; z-index: 1; }
        
        /* Hide Garbage & Ads */
        #ads, .ad, .advert, div[id^="ad"], iframe[src*="google"], iframe[src*="doubleclick"] { display: none !important; }
      \`;
      document.head.appendChild(style);
    })();
    true;
  `;

  useEffect(() => {
    enterFullScreen();
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      exitFullScreen().then(() => navigation.goBack());
      return true;
    });
    return () => {
      exitFullScreen();
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

  const handleAppStateChange = (nextAppState: any) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
    }
    appState.current = nextAppState;
  };

  const handleSaveProgress = async () => {
    await saveProgress({
      tmdbId, mediaType, lastSeason: season || 1, lastEpisode: episode || 1,
      position: 0, duration: 0, updatedAt: Date.now()
    });
  };

  const handleSourceFailure = () => {
      if (currentSourceIndex < STREAM_SOURCES.length - 1) {
          console.log(`❌ Source Failed: ${STREAM_SOURCES[currentSourceIndex].name}. Switching...`);
          setCurrentSourceIndex(prev => prev + 1);
          setLoading(true);
      } else {
          console.warn("All sources failed.");
          setLoading(false);
      }
  };

  const currentUrl = makeStreamUrl(STREAM_SOURCES[currentSourceIndex].url, mediaType, tmdbId, imdbId, season, episode);

  // --- SHOW TOAST ON SOURCE CHANGE ---
  useEffect(() => {
      console.log(`▶️ PLAYING:`, currentUrl);
      setShowToast(true);
      // Hide toast after 3 seconds
      const timer = setTimeout(() => setShowToast(false), 3000);
      return () => clearTimeout(timer);
  }, [currentSourceIndex]);

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      <WebView
        key={currentSourceIndex}
        source={{ uri: currentUrl }}
        style={styles.webview}
        injectedJavaScript={INJECTED_JS}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsFullscreenVideo={true}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback={true}
        
        // Strict Lock
        setSupportMultipleWindows={false} 
        javaScriptCanOpenWindowsAutomatically={false}
        onOpenWindow={(e) => e.preventDefault()}
        
        onShouldStartLoadWithRequest={(request) => {
            const isMainUrl = request.url === currentUrl;
            const isStreamProvider = STREAM_SOURCES.some(s => request.url.includes(s.url.split('/')[2]));
            if (isMainUrl || isStreamProvider || request.url.endsWith('.mp4') || request.url.includes('cdn')) {
                return true;
            }
            return false; 
        }}

        onError={() => handleSourceFailure()}
        onHttpError={(e) => { if (e.nativeEvent.statusCode >= 400) handleSourceFailure(); }}

        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        containerStyle={{ backgroundColor: 'black' }} 
      />

      {/* TOAST NOTIFICATION */}
      <SourceToast 
         sourceName={STREAM_SOURCES[currentSourceIndex].name} 
         visible={showToast} 
      />

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
             Loading {STREAM_SOURCES[currentSourceIndex].name}...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'black' },
  loader: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'black', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 100 
  },
  loadingText: { color: 'white', marginTop: 15, fontWeight: '600' },
  
  // Toast Styles
  toastContainer: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 20, 20, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    zIndex: 9999,
  },
  toastText: {
    color: '#E50914', // Netflix Red for contrast
    fontWeight: 'bold',
    fontSize: 14,
  }
});