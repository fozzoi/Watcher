// app/Player.tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Platform, AppState, BackHandler, TouchableOpacity } from 'react-native';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { getProgress, saveProgress, WatchProgress } from '../src/utils/progress';
import { getPlayerPreferences, PlayerPreferences, savePlayerPreferences } from '../src/utils/playerPreferences';

const generateHlsHtml = (url: string, initialPosition: number, preferences: PlayerPreferences) => `
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
          hls.on(Hls.Events.MANIFEST_PARSED, function() {
            video.currentTime = ${Math.max(0, initialPosition)};
            video.volume = ${preferences.volume};
            video.muted = ${preferences.muted};
            hls.currentLevel = ${preferences.quality === '1080p' ? 3 : preferences.quality === '720p' ? 2 : preferences.quality === '480p' ? 1 : -1};
            selectTracks();
            video.play();
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = videoSrc;
          video.addEventListener('loadedmetadata', function() {
            video.currentTime = ${Math.max(0, initialPosition)};
            video.volume = ${preferences.volume};
            video.muted = ${preferences.muted};
            selectTracks();
            video.play();
          });
        }
        function selectTracks() {
          if (${JSON.stringify(preferences.subtitleTrack)} && video.textTracks) {
            for (var i = 0; i < video.textTracks.length; i++) {
              video.textTracks[i].mode =
                video.textTracks[i].language === ${JSON.stringify(preferences.subtitleTrack)}
                  ? 'showing' : 'disabled';
            }
          }
        }
        setInterval(function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            position: video.currentTime || 0,
            duration: video.duration || 0
          }));
        }, 5000);
        video.addEventListener('volumechange', function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'playerSettings',
            volume: video.volume,
            muted: video.muted
          }));
        });
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
  const progressRef = useRef<WatchProgress | null>(null);
  const playerPreferencesRef = useRef<PlayerPreferences | null>(null);
  const transitionRef = useRef(0);
  const sourceKey = `${mediaType}:${tmdbId}`;

  useEffect(() => {
    const transition = ++transitionRef.current;
    enterFullScreen(transition);
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      exitFullScreen().then(() => router.back());
      return true;
    });
    return () => {
      exitFullScreen(++transitionRef.current);
      subscription.remove();
      backHandler.remove();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchStream = async () => {
      setLoading(true);
      try {
        const saved = await getProgress(tmdbId, mediaType, season || 1, episode || 1);
        const preferences = await getPlayerPreferences(sourceKey);
        progressRef.current = saved;
        playerPreferencesRef.current = preferences;
        const baseUrl = "https://watcher-api-rho.vercel.app";
        const encodedTitle = encodeURIComponent(title);
        const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${tmdbId}&media_type=${mediaType.toLowerCase()}&title=${encodedTitle}&season=${season || 1}&episode=${episode || 1}`;

        const response = await fetch(endpoint);
        const data = await response.json();

        if (isMounted && data.status === "success") {
          if (data.is_m3u8) {
            setActiveProvider("Direct Link (Ad-Free)");
            setStreamData(generateHlsHtml(data.stream_url, saved?.position ?? 0, preferences));
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

  const enterFullScreen = async (transition: number) => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    if (transition !== transitionRef.current) return;
    setStatusBarHidden(true, 'none');
    if (Platform.OS === 'android') await NavigationBar.setVisibilityAsync("hidden");
    const saved = await getProgress(tmdbId, mediaType, season || 1, episode || 1);
    progressRef.current = saved;
    await handleSaveProgress(saved?.position ?? 0, saved?.duration ?? 0);
  };

  const exitFullScreen = async (transition = ++transitionRef.current) => {
    if (transition !== transitionRef.current) return;
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    if (transition !== transitionRef.current) return;
    setStatusBarHidden(false, 'none');
    if (Platform.OS === 'android') await NavigationBar.setVisibilityAsync("visible");
  };

  const handleAppStateChange = (nextAppState: any) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden");
      setStatusBarHidden(true, 'none');
    }
    appState.current = nextAppState;
  };

  const handleSaveProgress = async (position = 0, duration = 0) => {
    await saveProgress({
      tmdbId, mediaType, title, poster,
      lastSeason: season || 1, lastEpisode: episode || 1,
      position, duration, updatedAt: Date.now()
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {streamData ? (
        <WebView
          key={sourceKey}
          // 🎯 Check if it's a direct URL or HTML code
          source={streamData.startsWith('http') ? { uri: streamData } : { html: streamData }}
          style={styles.webview}
          containerStyle={{ backgroundColor: 'black' }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          injectedJavaScript={
            playerPreferencesRef.current
              ? `(() => {
                  const video = document.querySelector('video');
                  if (video) {
                    video.volume = ${playerPreferencesRef.current.volume};
                    video.muted = ${playerPreferencesRef.current.muted};
                  }
                  true;
                })();`
              : undefined
          }
          onMessage={(event) => {
            try {
              const progress = JSON.parse(event.nativeEvent.data);
              if (progress.type === 'playerSettings') {
                const { type, ...changes } = progress;
                savePlayerPreferences(sourceKey, changes).then((next) => {
                  playerPreferencesRef.current = next;
                }).catch((error) => console.warn('Failed to save player preferences:', error));
                return;
              }
              if (Number.isFinite(progress.position) && Number.isFinite(progress.duration)) {
                progressRef.current = {
                  tmdbId, mediaType, title, poster,
                  lastSeason: season || 1, lastEpisode: episode || 1,
                  position: progress.position, duration: progress.duration, updatedAt: Date.now(),
                };
                handleSaveProgress(progress.position, progress.duration);
              }
            } catch {
              // Ignore non-progress messages from embedded players.
            }
          }}
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