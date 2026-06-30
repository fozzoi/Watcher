// app/Player.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, BackHandler, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRoute, useNavigation } from "@react-navigation/native";
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { saveProgress } from '../src/utils/progress';
import { Ionicons } from '@expo/vector-icons';

const generateHlsHtml = (url: string) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        body { margin: 0; background: black; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
        video { width: 100%; height: 100%; outline: none; }
      </style>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    </head>
    <body>
      <video id="video" controls autoplay playsinline></video>
      <script>
        var video = document.getElementById('video');
        var videoSrc = '${url}';
        if (Hls.isSupported()) {
          var hls = new Hls();
          hls.loadSource(videoSrc);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play(); });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc;
          video.addEventListener('loadedmetadata', function() { video.play(); });
        }
      </script>
    </body>
  </html>
`;

export default function Player() {
  const route = useRoute();
  const navigation = useNavigation();
  const { tmdbId, mediaType, season, episode, title, poster } = route.params as any;

  const [streamData, setStreamData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState("Watcher Engine");
  const appState = useRef(AppState.currentState);

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
    let isMounted = true;
    const fetchStream = async () => {
      setLoading(true);
      try {
        // 🎯 Pointing directly to your Vercel deployment
        const baseUrl = "https://watcher-api-rho.vercel.app"; 
        const encodedTitle = encodeURIComponent(title);
        
        const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${tmdbId}&media_type=${mediaType.toLowerCase()}&title=${encodedTitle}&season=${season || 1}&episode=${episode || 1}`;     
        console.log("📡 Fetching:", endpoint);
        
        const response = await fetch(endpoint);
        const data = await response.json();

        if (isMounted && data.status === "success") {
            if (data.is_m3u8) {
                setActiveProvider("Direct Link (Ad-Free)");
                setStreamData(generateHlsHtml(data.stream_url));
            } else {
                setActiveProvider("Iframe Fallback");
                setStreamData(`
                  <html>
                    <body style="margin:0;background:black;">
                      <iframe src="${data.stream_url}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
                    </body>
                  </html>
                `);
            }
        }
      } catch (error) {
        console.error("❌ Connection Error:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchStream();
    return () => { isMounted = false; };
  }, [tmdbId, mediaType, season, episode]);

  const enterFullScreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    if (Platform.OS === 'android') await NavigationBar.setVisibilityAsync("hidden");
    handleSaveProgress();
  };

  const exitFullScreen = async () => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    if (Platform.OS === 'android') await NavigationBar.setVisibilityAsync("visible");
  };

  const handleAppStateChange = (nextAppState: any) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
    }
    appState.current = nextAppState;
  };

  const handleSaveProgress = async () => {
    await saveProgress({
      tmdbId, mediaType, title, poster,
      lastSeason: season || 1, lastEpisode: episode || 1,
      position: 0, duration: 0, updatedAt: Date.now()
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />
      
      {streamData ? (
          <WebView
            key={tmdbId}
            source={{ html: streamData }}
            style={styles.webview}
            containerStyle={{ backgroundColor: 'black' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsFullscreenVideo={true}
            mediaPlaybackRequiresUserAction={false}
            injectedJavaScript={`
              window.open = function() { return null; };
              window.onbeforeunload = function() { return "Prevented"; };
              true;
            `}
            onShouldStartLoadWithRequest={(request) => {
              const isMainHtml = request.url === 'about:blank' || request.url.startsWith('data:');
              const isSafe = request.url.includes('cdn') || request.url.includes('m3u8') || request.url.includes('vidsrc');
              return isMainHtml || isSafe;
            }}
          />
      ) : null}

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>Connecting to {activeProvider}...</Text>
        </View>
      )}

      {/* Exit Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => { exitFullScreen().then(() => navigation.goBack()) }}>
        <Ionicons name="close" size={28} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  webview: { flex: 1, backgroundColor: 'transparent' }, 
  loader: { ...StyleSheet.absoluteFill, backgroundColor: 'black', justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  loadingText: { color: 'white', marginTop: 15, fontWeight: '600' },
  backButton: { position: 'absolute', top: 20, left: 20, zIndex: 200, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20 }
});