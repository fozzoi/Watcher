// app/Player.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, BackHandler, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { saveProgress } from '../src/utils/progress';


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
  const router = useRouter();
  const { id: paramId, media_type, trailerUrl: initialTrailerUrl, imdbId, title: paramTitle, season: paramSeason, episode: paramEpisode, poster: paramPoster, episodeName } = useLocalSearchParams();
  
  const tmdbId = Number(paramId);
  const mediaType = media_type as 'movie' | 'tv';
  const title = paramTitle as string;
  const season = paramSeason ? Number(paramSeason) : undefined;
  const episode = paramEpisode ? Number(paramEpisode) : undefined;
  const poster = paramPoster as string;

  const [streamData, setStreamData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeProvider, setActiveProvider] = useState("Watcher Engine");
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    enterFullScreen();
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      exitFullScreen().then(() => router.back());
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
        const baseUrl = "https://watcher-api-rho.vercel.app"; 
        const encodedTitle = encodeURIComponent(title);
        const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${tmdbId}&media_type=${mediaType.toLowerCase()}&title=${encodedTitle}&season=${season || 1}&episode=${episode || 1}`;     
        
        const response = await fetch(endpoint);
        const data = await response.json();

        if (isMounted && data.status === "success") {
            if (data.is_m3u8) {
                setActiveProvider("Direct Link (Ad-Free)");
                setStreamData(generateHlsHtml(data.stream_url));
            } else {
                setActiveProvider("Web Player");
                // 🎯 Pass the raw URL directly instead of building an iframe
                setStreamData(data.stream_url); 
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
            // 🎯 Check if it's a direct URL or HTML code
            source={streamData.startsWith('http') ? { uri: streamData } : { html: streamData }}
            style={styles.webview}
            containerStyle={{ backgroundColor: 'black' }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowsFullscreenVideo={true}
            mediaPlaybackRequiresUserAction={false}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) => {
              const url = request.url;
              // Only allow the main player, data streams, and safe CDNs
              return url === 'about:blank' || url.startsWith('data:') || url.startsWith('blob:') || url.includes('embed.su') || url.includes('vidsrc');
            }}
          />
      ) : null}

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#E50914" />
          <Text style={styles.loadingText}>Connecting to {activeProvider}...</Text>
        </View>
      )}
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