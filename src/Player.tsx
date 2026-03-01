import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { saveProgress } from '../src/utils/progress';
import { STREAM_SOURCES, makeStreamUrl } from '../src/utils/sources';

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
  // Destructure the new title and poster props passed from DetailPage
  const { tmdbId, imdbId, mediaType, season, episode, startIndex = 0, title, poster } = route.params as any;

  const [currentSourceIndex, setCurrentSourceIndex] = useState(startIndex);
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState(false);
  
  const appState = useRef(AppState.currentState);

  const INJECTED_JS = `
    (function() {
      var meta = document.createElement('meta');
      meta.name = "viewport";
      meta.content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
      document.getElementsByTagName('head')[0].appendChild(meta);

      const style = document.createElement('style');
      style.innerHTML = \`
        html, body {
          background-color: transparent !important; 
          margin: 0 !important;
          padding: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          overflow: hidden !important;
        }
        video, iframe, .jwplayer, #player, .video-js {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          bottom: 0 !important;
          right: 0 !important;
          width: 100% !important;
          height: 100% !important;
          opacity: 0.99 !important; 
          background: #000 !important;
          z-index: 1 !important;
        }
        .jw-controls, .vjs-control-bar, .plyr__controls {
            opacity: 1 !important;
            visibility: visible !important;
            z-index: 99999 !important;
        }
        #ads, .ad, .advert, div[id^="ad"], header, footer { 
           display: none !important; 
        }
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

  useEffect(() => {
    setLoading(true);
    const url = makeStreamUrl(
        STREAM_SOURCES[currentSourceIndex].url, 
        mediaType, 
        tmdbId, 
        imdbId, 
        season, 
        episode
    );
    
    setCurrentUrl(url);
    setShowToast(true);
    const timer = setTimeout(() => setShowToast(false), 3000);
    setTimeout(() => setLoading(false), 2000);

    return () => clearTimeout(timer);
  }, [currentSourceIndex, tmdbId, season, episode]);

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
      tmdbId, 
      mediaType, 
      title: title || "Unknown Title", 
      poster: poster || "",
      lastSeason: season || 1, 
      lastEpisode: episode || 1,
      position: 0, 
      duration: 0, 
      updatedAt: Date.now()
    });
  };

  const handleSourceFailure = () => {
      if (currentSourceIndex < STREAM_SOURCES.length - 1) {
          console.log(`❌ Source Failed: ${STREAM_SOURCES[currentSourceIndex].name}. Switching...`);
          setCurrentSourceIndex((prev: number) => prev + 1);
          setLoading(true);
      } else {
          setLoading(false);
      }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      {currentUrl ? (
          <WebView
            key={currentSourceIndex}
            source={{ uri: currentUrl }}
            style={styles.webview}
            containerStyle={{ backgroundColor: 'black' }}
            injectedJavaScript={INJECTED_JS}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            androidLayerType="hardware" 
            backgroundColor="transparent" 
            scrollEnabled={false}
            overScrollMode="never"
            bounces={false}
            scalesPageToFit={true}
            allowsFullscreenVideo={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            setSupportMultipleWindows={false} 
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
            onLoadEnd={() => setLoading(false)}
          />
      ) : null}

      <SourceToast 
         sourceName={STREAM_SOURCES[currentSourceIndex]?.name || "Source"} 
         visible={showToast} 
      />

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>
             Loading {STREAM_SOURCES[currentSourceIndex]?.name || "Stream"}...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'transparent' }, 
  loader: { 
    ...StyleSheet.absoluteFillObject, 
    backgroundColor: 'black', 
    justifyContent: 'center', 
    alignItems: 'center', 
    zIndex: 100,
    pointerEvents: 'none',
  },
  loadingText: { color: 'white', marginTop: 15, fontWeight: '600' },
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
    pointerEvents: 'none',
  },
  toastText: {
    color: '#E50914',
    fontWeight: 'bold',
    fontSize: 14,
  }
});