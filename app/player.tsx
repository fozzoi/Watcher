// app/Player.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Text,
  Platform,
  AppState,
  BackHandler,
  TouchableOpacity,
  StatusBar as RNStatusBar
} from 'react-native';
import { LoadingIndicator } from '../src/components/shared/LoadingIndicator';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { getProgress, saveProgress, WatchProgress } from '../src/utils/progress';
import { getPlayerPreferences, savePlayerPreferences } from '../src/utils/playerPreferences';
import type { PlayerProvider, VideoFitMode } from '../src/utils/playerPreferences';
import { findAdjacentEpisode, parseEpisodePosition, parseSeasonEpisodeCounts } from '../src/utils/playerEpisodes';
import { useAppTheme } from '../src/theme';

const PROVIDERS: PlayerProvider[] = ['Vidy', 'VidLink', 'Atlantic', 'Movy'];

const injectedPreScript = `
  (function() {
    window.isWatcherPlayer = true;

    // 1. Block window.open popups and popunders completely
    window.open = function() { return null; };

    // 2. Block Monetag and common ad network global variables
    try {
      Object.defineProperty(window, 'monetag', { get: function() { return {}; }, set: function() {} });
      Object.defineProperty(window, '_monetag', { get: function() { return {}; }, set: function() {} });
    } catch(e) {}

    // 3. Block dynamic script injection from ad networks (Monetag, adcash, etc.)
    try {
      function isAdUrl(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.toLowerCase();
        return u.includes('monetag') || u.includes('adcash') || u.includes('popunder') ||
               u.includes('propush') || u.includes('alwingulla') || u.includes('onclick') ||
               u.includes('highperformancegate') || u.includes('effectivecpmgate') ||
               u.includes('syndication') || u.includes('hilltopads');
      }

      var origCreateElement = document.createElement;
      document.createElement = function(tagName) {
        var el = origCreateElement.apply(this, arguments);
        if (tagName && typeof tagName === 'string' && tagName.toLowerCase() === 'script') {
          var origSetAttribute = el.setAttribute;
          el.setAttribute = function(name, value) {
            if (name === 'src' && isAdUrl(value)) return;
            return origSetAttribute.apply(this, arguments);
          };
          try {
            Object.defineProperty(el, 'src', {
              set: function(val) {
                if (!isAdUrl(val)) el.setAttribute('src', val);
              },
              get: function() { return el.getAttribute('src'); }
            });
          } catch(e) {}
        }
        return el;
      };
    } catch(e) {}

    // 4. Ensure playsinline on all media elements
    try {
      if (window.HTMLMediaElement) {
        var origPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function() {
          this.setAttribute('playsinline', '');
          this.setAttribute('webkit-playsinline', '');
          return origPlay.apply(this, arguments);
        };
      }
    } catch(e) {}
  })();
  true;
`;

const generateInjectedPostScript = (currentFitMode: VideoFitMode) => `
  (function() {
    window.__watcherFitMode = '${currentFitMode}';
    var autoplayAllowed = true;

    function disableAutoplay() {
      autoplayAllowed = false;
    }

    // Stop autoplay attempts after 3.5 seconds
    setTimeout(disableAutoplay, 3500);

    // Any user touch immediately disables autoplay enforcer so Pause/Play work natively
    document.addEventListener('pointerdown', disableAutoplay, { capture: true, passive: true });
    document.addEventListener('touchstart', function() {
      disableAutoplay();
      var vids = document.querySelectorAll('video');
      vids.forEach(function(v) {
        v.muted = false;
        v.volume = 1.0;
      });
    }, { capture: true, passive: true });
    document.addEventListener('click', disableAutoplay, { capture: true, passive: true });

    // Report user taps to React Native without blocking any clicks
    document.addEventListener('pointerup', function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'userTap' }));
      }
    }, { passive: true });

    // Function to apply fit mode immediately to all current and future videos
    window.__watcherApplyFit = function(mode) {
      window.__watcherFitMode = mode;
      var vids = document.querySelectorAll('video');
      vids.forEach(function(video) {
        video.style.setProperty('object-fit', mode, 'important');
        video.style.setProperty('width', '100vw', 'important');
        video.style.setProperty('height', '100vh', 'important');
      });
      var style = document.getElementById('watcher-custom-style');
      if (style) {
        style.innerHTML = \`
          html, body, #__next, #root, [class*="player-wrapper"], .vidy, .video-container {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
          }
          video, .vidy video, [class*="video"] video, .video-js video, div > video {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            object-fit: \${mode} !important;
            outline: none !important;
          }
          iframe {
            width: 100vw !important;
            height: 100vh !important;
            border: none !important;
          }
          /* Ad-blocking CSS rules */
          [id*="monetag"], [class*="monetag"],
          [id*="ad-"], [class*="ad-"], [id*="ad_"], [class*="ad_"],
          [class*="banner"], [id*="banner"], [class*="popunder"], [id*="popunder"],
          div[style*="z-index: 2147483647"], div[style*="z-index: 999999"] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            opacity: 0 !important;
          }
        \`;
      }
    };

    function injectStyles() {
      var existingStyle = document.getElementById('watcher-custom-style');
      if (!existingStyle) {
        var style = document.createElement('style');
        style.id = 'watcher-custom-style';
        style.innerHTML = \`
          html, body, #__next, #root, [class*="player-wrapper"], .vidy, .video-container {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
            background: #000 !important;
          }
          video, .vidy video, [class*="video"] video, .video-js video, div > video {
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            max-height: 100vh !important;
            object-fit: \${window.__watcherFitMode || 'cover'} !important;
            outline: none !important;
          }
          iframe {
            width: 100vw !important;
            height: 100vh !important;
            border: none !important;
          }
          /* Ad-blocking CSS rules */
          [id*="monetag"], [class*="monetag"],
          [id*="ad-"], [class*="ad-"], [id*="ad_"], [class*="ad_"],
          [class*="banner"], [id*="banner"], [class*="popunder"], [id*="popunder"],
          div[style*="z-index: 2147483647"], div[style*="z-index: 999999"] {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
            width: 0 !important;
            height: 0 !important;
            opacity: 0 !important;
          }
        \`;
        (document.head || document.documentElement).appendChild(style);
      }
    }
    // Message bridge from embedded iframe providers (VidLink, Vidy, etc.)
    window.addEventListener('message', function(e) {
      try {
        var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (d && window.ReactNativeWebView) {
          if (d.type === 'MEDIA_DATA' && d.data) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              currentTime: d.data.currentTime,
              duration: d.data.duration
            }));
          } else if (d.event === 'timeupdate' || (d.currentTime !== undefined && d.duration !== undefined)) {
            window.ReactNativeWebView.postMessage(JSON.stringify(d));
          }
        }
      } catch(err) {}
    });

    injectStyles();

    // Movy: trigger immediate boot & click Play button
    function triggerMovyPlayback() {
      if (location.hostname.includes('movy.sx')) {
        window.dispatchEvent(new Event('pointerdown'));
        window.dispatchEvent(new Event('touchstart'));
        var movyPlay = document.querySelector('button.mv-btn--primary, button.mv-btn--primary span');
        if (movyPlay) {
          var btn = movyPlay.tagName === 'BUTTON' ? movyPlay : movyPlay.closest('button');
          if (btn && btn.offsetParent !== null) {
            btn.click();
          }
        }
      }
    }
    triggerMovyPlayback();

    function enforce() {
      injectStyles();
      triggerMovyPlayback();

      var currentMode = window.__watcherFitMode || 'cover';
      var vids = document.querySelectorAll('video');
      vids.forEach(function(video) {
        if (video.style.getPropertyValue('object-fit') !== currentMode) {
          video.style.setProperty('object-fit', currentMode, 'important');
          video.style.setProperty('width', '100vw', 'important');
          video.style.setProperty('height', '100vh', 'important');
        }
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');

        if (video.muted) {
          video.muted = false;
        }
        if (video.volume < 0.9) {
          video.volume = 1.0;
        }

        if (!video.dataset.watcherAttached) {
          video.dataset.watcherAttached = 'true';

          ['loadedmetadata', 'canplay', 'play', 'playing', 'resize'].forEach(function(evt) {
            video.addEventListener(evt, function() {
              video.style.setProperty('object-fit', window.__watcherFitMode || 'cover', 'important');
              video.style.setProperty('width', '100vw', 'important');
              video.style.setProperty('height', '100vh', 'important');
              disableAutoplay();
            });
          });

          video.addEventListener('timeupdate', function() {
            if (window.ReactNativeWebView && video.duration > 0 && !video.paused) {
              var now = Date.now();
              if (!video._lastProgressReport || now - video._lastProgressReport > 2500) {
                video._lastProgressReport = now;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'timeupdate',
                  currentTime: video.currentTime,
                  duration: video.duration
                }));
              }
            }
          });

          video.addEventListener('volumechange', function() {
            if (!autoplayAllowed && window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'playerSettings',
                volume: video.volume,
                muted: video.muted
              }));
            }
          });

          video.addEventListener('ended', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                event: 'ended'
              }));
            }
          });
        }

        if (autoplayAllowed && video.paused) {
          video.autoplay = true;
          video.muted = false;
          video.volume = 1.0;
          var p = video.play();
          if (p !== undefined && p.catch) {
            p.catch(function() {
              video.muted = true;
              video.play().then(function() {
                setTimeout(function() {
                  video.muted = false;
                  video.volume = 1.0;
                }, 200);
              }).catch(function() {});
            });
          }
        }
      });

      if (autoplayAllowed) {
        var playSelectors = [
          'button[aria-label="Play"]',
          'button[aria-label="play"]',
          '.vjs-big-play-button',
          '[data-testid="play-button"]',
          '.art-state',
          '.jw-display-icon-container',
          'button.mv-btn--primary',
          'svg[aria-label="Play"]'
        ];
        playSelectors.forEach(function(sel) {
          try {
            var btns = document.querySelectorAll(sel);
            btns.forEach(function(b) {
              if (b && b.offsetParent !== null) {
                b.click();
              }
            });
          } catch(e) {}
        });
      }

      document.querySelectorAll('iframe').forEach(function(frame) {
        try {
          frame.style.setProperty('width', '100vw', 'important');
          frame.style.setProperty('height', '100vh', 'important');
          var frameDoc = frame.contentDocument || frame.contentWindow.document;
          if (frameDoc) {
            var fvids = frameDoc.querySelectorAll('video');
            fvids.forEach(function(fv) {
              fv.style.setProperty('object-fit', window.__watcherFitMode || 'cover', 'important');
              fv.style.setProperty('width', '100vw', 'important');
              fv.style.setProperty('height', '100vh', 'important');
              if (fv.muted) fv.muted = false;
              if (autoplayAllowed && fv.paused) {
                fv.play().catch(function() {});
              }
            });
          }
        } catch(e) {}
      });
    }

    var interval = setInterval(enforce, 200);
    setTimeout(function() {
      clearInterval(interval);
      setInterval(enforce, 1200);
    }, 4000);
    enforce();

    try {
      var observer = new MutationObserver(function() {
        enforce();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    } catch(e) {}
  })();
  true;
`;

const buildProviderUrl = (
  provider: PlayerProvider,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season: number,
  episode: number,
  savedSecs: number
): string => {
  const progressParam = savedSecs > 10 ? `&progress=${savedSecs}` : '';
  if (provider === 'Vidy') {
    return mediaType === 'tv'
      ? `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}?color=E50914&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=true&autoplay=1&autoPlay=true${progressParam}`
      : `https://www.vidy.st/movie/${tmdbId}?color=E50914&autoplay=true&autoplay=1&autoPlay=true${progressParam}`;
  }
  if (provider === 'VidLink') {
    return mediaType === 'tv'
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1&autoPlay=true`
      : `https://vidlink.pro/movie/${tmdbId}?autoplay=true&autoplay=1&autoPlay=true`;
  }
  if (provider === 'Atlantic') {
    return mediaType === 'tv'
      ? `https://atlantic.st/embed/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1`
      : `https://atlantic.st/embed/movie/${tmdbId}?autoplay=true&autoplay=1`;
  }
  // Movy
  return mediaType === 'tv'
    ? `https://www.movy.sx/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1`
    : `https://www.movy.sx/movie/${tmdbId}?autoplay=true&autoplay=1`;
};

export default function Player() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const {
    id: paramId,
    media_type,
    title: paramTitle,
    season: paramSeason,
    episode: paramEpisode,
    poster: paramPoster,
    previousSeason: paramPreviousSeason,
    previousEpisode: paramPreviousEpisode,
    nextSeason: paramNextSeason,
    nextEpisode: paramNextEpisode,
    seasonCounts: paramSeasonCounts,
  } = useLocalSearchParams();

  const tmdbId = Number(paramId);
  const mediaType = media_type as 'movie' | 'tv';
  const title = (paramTitle as string) || '';
  const season = paramSeason ? Number(paramSeason) : 1;
  const episode = paramEpisode ? Number(paramEpisode) : 1;
  const poster = (paramPoster as string) || '';
  const seasonCounts = parseSeasonEpisodeCounts(paramSeasonCounts);
  const previousPosition = parseEpisodePosition(paramPreviousSeason, paramPreviousEpisode)
    || findAdjacentEpisode(season, episode, seasonCounts, -1);
  const nextPosition = parseEpisodePosition(paramNextSeason, paramNextEpisode)
    || findAdjacentEpisode(season, episode, seasonCounts, 1);

  const [provider, setProvider] = useState<PlayerProvider>('Vidy');
  const [providerInitialized, setProviderInitialized] = useState(false);
  const [streamData, setStreamData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNextEpisode, setShowNextEpisode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [fitMode, setFitMode] = useState<VideoFitMode>('cover');
  const [controlsVisible, setControlsVisible] = useState(true);

  const webViewRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appState = useRef(AppState.currentState);
  const progressRef = useRef<WatchProgress | null>(null);
  const transitionRef = useRef(0);
  const sourceKey = `${mediaType}:${tmdbId}:${provider.toLowerCase()}`;
  const latestPositionRef = useRef({ position: 0, duration: 0 });
  const isLeavingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const loadPreferredProvider = async () => {
      try {
        const preferences = await getPlayerPreferences();
        if (isMounted) setProvider(preferences.preferredProvider);
      } catch (error) {
        console.error('Failed to load preferred player source:', error);
      } finally {
        if (isMounted) setProviderInitialized(true);
      }
    };

    void loadPreferredProvider();
    return () => { isMounted = false; };
  }, []);

  // Auto-hide overlay after 3 seconds
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setControlsVisible(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetControlsTimeout();
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout]);

  // Immediate live fit mode cycling (Fill -> Fit -> Stretch -> Fill)
  const cycleFitMode = () => {
    const nextMode: VideoFitMode = fitMode === 'cover' ? 'contain' : fitMode === 'contain' ? 'fill' : 'cover';
    setFitMode(nextMode);
    void savePlayerPreferences(sourceKey, { fitMode: nextMode });

    const script = `
      (function() {
        if (typeof window.__watcherApplyFit === 'function') {
          window.__watcherApplyFit('${nextMode}');
        } else {
          window.__watcherFitMode = '${nextMode}';
          var vids = document.querySelectorAll('video');
          vids.forEach(function(v) {
            v.style.setProperty('object-fit', '${nextMode}', 'important');
            v.style.setProperty('width', '100vw', 'important');
            v.style.setProperty('height', '100vh', 'important');
          });
        }
      })();
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
    resetControlsTimeout();
  };

  const switchSource = () => {
    const currentIndex = PROVIDERS.indexOf(provider);
    const nextProvider = PROVIDERS[(currentIndex + 1) % PROVIDERS.length];
    setProvider(nextProvider);
    void savePlayerPreferences(undefined, { preferredProvider: nextProvider }).catch((error) => {
      console.error('Failed to save preferred player source:', error);
    });
    setLoading(true);
    const savedSecs = Math.floor(progressRef.current?.position || 0);
    const nextUrl = buildProviderUrl(nextProvider, tmdbId, mediaType, season, episode, savedSecs);
    setStreamData(nextUrl);
    resetControlsTimeout();
  };

  const enterFullScreen = async (transition: number) => {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    if (transition !== transitionRef.current) return;
    setIsFullscreen(true);
    setStatusBarHidden(true, 'none');
    RNStatusBar.setHidden(true, 'none');
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("hidden").catch(() => {});
    }
  };

  const exitFullScreen = async (transition = ++transitionRef.current) => {
    if (transition !== transitionRef.current) return;
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    if (transition !== transitionRef.current) return;
    setIsFullscreen(false);
    setStatusBarHidden(false, 'none');
    RNStatusBar.setHidden(false, 'none');
    if (Platform.OS === 'android') {
      await NavigationBar.setVisibilityAsync("visible").catch(() => {});
    }
  };

  useEffect(() => {
    const transition = ++transitionRef.current;
    void enterFullScreen(transition);
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExit();
      return true;
    });
    const orientationSubscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      const landscape = orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        orientationInfo.orientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      if (landscape && !isLeavingRef.current) {
        setStatusBarHidden(true, 'none');
        RNStatusBar.setHidden(true, 'none');
        if (Platform.OS === 'android') void NavigationBar.setVisibilityAsync('hidden').catch(() => {});
      } else if (!landscape && isLeavingRef.current) {
        setStatusBarHidden(false, 'none');
        RNStatusBar.setHidden(false, 'none');
        if (Platform.OS === 'android') void NavigationBar.setVisibilityAsync('visible').catch(() => {});
      }
    });
    return () => {
      isLeavingRef.current = true;
      void flushProgress();
      void exitFullScreen(++transitionRef.current);
      subscription.remove();
      backHandler.remove();
      ScreenOrientation.removeOrientationChangeListener(orientationSubscription);
    };
  }, []);

  useEffect(() => {
    if (!providerInitialized) return;

    let isMounted = true;
    const initStream = async () => {
      setLoading(true);
      isLeavingRef.current = false;
      latestPositionRef.current = { position: 0, duration: 0 };
      setShowNextEpisode(false);
      setStreamData(null);
      try {
        const saved = await getProgress(tmdbId, mediaType, season, episode, sourceKey);
        const preferences = await getPlayerPreferences(sourceKey);
        progressRef.current = saved;

        if (preferences.fitMode) {
          setFitMode(preferences.fitMode);
        }
        if (preferences.muted) {
          void savePlayerPreferences(sourceKey, { muted: false, volume: 1.0 });
        }

        if (isMounted) {
          const savedSecs = Math.floor(saved?.position || 0);
          const initialUrl = buildProviderUrl(provider, tmdbId, mediaType, season, episode, savedSecs);
          setStreamData(initialUrl);
        }
      } catch (error) {
        console.error("❌ Stream init error:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initStream();
    return () => { isMounted = false; };
  }, [tmdbId, mediaType, season, episode, provider, providerInitialized]);

  const handleAppStateChange = (nextAppState: any) => {
    if (nextAppState.match(/inactive|background/)) {
      void flushProgress();
    }
    if (appState.current?.match(/inactive|background/) && nextAppState === 'active') {
      if (Platform.OS === 'android') NavigationBar.setVisibilityAsync("hidden").catch(() => {});
      setStatusBarHidden(true, 'none');
      RNStatusBar.setHidden(true, 'none');
    }
    appState.current = nextAppState;
  };

  const flushProgress = async () => {
    const { position, duration } = latestPositionRef.current;
    const saved = progressRef.current;
    if (!saved && position <= 0) return;
    const pos = position || saved?.position || 0;
    const dur = duration || saved?.duration || 0;
    await handleSaveProgress(pos, dur);
  };

  const handleSaveProgress = async (position = 0, duration = 0, completed?: boolean) => {
    const isDone = completed !== undefined ? completed : (duration > 0 && ((position / duration >= 0.9) || (duration - position <= 60 && position >= 30)));
    await saveProgress({
      tmdbId, mediaType, title, poster,
      lastSeason: season, lastEpisode: episode,
      position, duration, completed: isDone, updatedAt: Date.now(), sourceKey,
    });
  };

  const handleExit = () => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    void flushProgress().then(() => exitFullScreen()).then(() => router.back());
  };

  const navigateEpisode = async (
    target: { season: number; episode: number } | undefined,
    direction: -1 | 1,
  ) => {
    if (!target || isLeavingRef.current) return;
    isLeavingRef.current = true;
    try {
      if (direction === 1) {
        const dur = latestPositionRef.current.duration || progressRef.current?.duration || 100;
        await handleSaveProgress(dur, dur, true);
      } else {
        await flushProgress();
      }

      const currentPosition = { season, episode };
      const previous = direction === 1
        ? currentPosition
        : findAdjacentEpisode(target.season, target.episode, seasonCounts, -1);
      const next = direction === -1
        ? currentPosition
        : findAdjacentEpisode(target.season, target.episode, seasonCounts, 1);
      const episodeGuide = seasonCounts.length
        ? `&seasonCounts=${encodeURIComponent(JSON.stringify(seasonCounts))}`
        : '';
      const previousParams = previous
        ? `&previousSeason=${previous.season}&previousEpisode=${previous.episode}`
        : '';
      const nextParams = next
        ? `&nextSeason=${next.season}&nextEpisode=${next.episode}`
        : '';

      router.replace(
        `/player?id=${tmdbId}&media_type=${mediaType}&title=${encodeURIComponent(title)}&season=${target.season}&episode=${target.episode}&poster=${encodeURIComponent(poster)}&episodeName=Episode%20${target.episode}${previousParams}${nextParams}${episodeGuide}`,
      );
    } catch (error) {
      isLeavingRef.current = false;
      console.error('Failed to navigate between episodes:', error);
    }
  };

  const goToNextEpisode = () => navigateEpisode(nextPosition, 1);
  const goToPreviousEpisode = () => navigateEpisode(previousPosition, -1);

  return (
    <View style={styles.container}>
      {/* Configure Stack native screen options to hide status bar & navigation bar */}
      <Stack.Screen
        options={{
          headerShown: false,
          statusBarHidden: true,
          navigationBarHidden: true,
        }}
      />
      <StatusBar hidden={true} />

      {streamData ? (
        <WebView
          ref={webViewRef}
          key={streamData}
          source={{ uri: streamData }}
          style={styles.webview}
          containerStyle={{ backgroundColor: 'black' }}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsFullscreenVideo={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          setSupportMultipleWindows={false}
          scalesPageToFit={false}
          injectedJavaScriptBeforeContentLoaded={injectedPreScript}
          injectedJavaScript={generateInjectedPostScript(fitMode)}
          onLoadEnd={() => setLoading(false)}
          onMessage={(event: WebViewMessageEvent): void => {
            try {
              const progress = JSON.parse(event.nativeEvent.data);

              // Seamless user tap detected inside WebView: shows HUD without blocking any web controls
              if (progress.type === 'userTap') {
                resetControlsTimeout();
                return;
              }

              if (progress.event === 'ended' && nextPosition) {
                void goToNextEpisode();
                return;
              }
              if (progress.nearCredits && nextPosition) setShowNextEpisode(true);
              if (progress.type === 'playerSettings') {
                const { type, ...changes } = progress;
                savePlayerPreferences(sourceKey, { ...changes, muted: false }).catch(() => {});
                return;
              }

              const pos = Number.isFinite(progress.currentTime) ? progress.currentTime : progress.position;
              const dur = Number.isFinite(progress.duration) ? progress.duration : 0;
              if (Number.isFinite(pos) && pos > 0) {
                if (dur > 0 && pos / dur >= 0.8 && dur - pos <= 90 && nextPosition) {
                  setShowNextEpisode(true);
                }
                progressRef.current = {
                  tmdbId, mediaType, title, poster,
                  lastSeason: season, lastEpisode: episode,
                  position: pos, duration: dur, updatedAt: Date.now(),
                };
                latestPositionRef.current = { position: pos, duration: dur };
                void handleSaveProgress(pos, dur);
              }
            } catch {
              // Ignore non-progress messages
            }
          }}
          onShouldStartLoadWithRequest={(request: { url: string }): boolean => {
            const url = request.url.toLowerCase();

            // Aggressive Ad Network Blocker
            if (
              url.includes('monetag') ||
              url.includes('adcash') ||
              url.includes('propush') ||
              url.includes('alwingulla') ||
              url.includes('onclick') ||
              url.includes('popunder') ||
              url.includes('highperformancegate') ||
              url.includes('effectivecpmgate') ||
              url.includes('syndication') ||
              url.includes('hilltopads')
            ) {
              return false;
            }

            // Whitelist verified streaming hosts and media CDNs
            return (
              url === 'about:blank' ||
              url.startsWith('data:') ||
              url.startsWith('blob:') ||
              url.includes('vidy.st') ||
              url.includes('vidlink.pro') ||
              url.includes('atlantic.st') ||
              url.includes('movy.sx') ||
              url.includes('hls.lol') ||
              url.includes('wecollege.net') ||
              url.includes('jwplayer.com') ||
              url.includes('wsrv.nl')
            );
          }}
        />
      ) : null}

      {/* Floating Center HUD: Back | Source | Fit Mode (Zero blocking: pointerEvents='none' when hidden, 'box-none' when visible) */}
      <View
        style={[
          styles.hudContainer,
          { opacity: controlsVisible ? 1 : 0 }
        ]}
        pointerEvents={controlsVisible ? 'box-none' : 'none'}
      >
        <View style={styles.hudCapsule}>
          <TouchableOpacity
            style={styles.hudButton}
            onPress={handleExit}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={17} color="#fff" />
          </TouchableOpacity>

          <View style={styles.hudDivider} />

          <TouchableOpacity
            style={styles.hudButton}
            onPress={switchSource}
            activeOpacity={0.7}
          >
            <Text style={styles.sourceText}>{provider}</Text>
            <Ionicons name="swap-horizontal" size={13} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>

          <View style={styles.hudDivider} />

          <TouchableOpacity
            style={styles.hudButton}
            onPress={cycleFitMode}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={fitMode === 'cover' ? 'crop-free' : fitMode === 'contain' ? 'aspect-ratio' : 'fit-screen'}
              size={17}
              color="#fff"
            />
            <Text style={styles.fitModeText}>
              {fitMode === 'cover' ? 'Fill' : fitMode === 'contain' ? 'Fit' : 'Stretch'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {previousPosition && (
        <TouchableOpacity
          style={[styles.episodeButton, styles.previousEpisodeButton]}
          onPress={goToPreviousEpisode}
          accessibilityRole="button"
          accessibilityLabel={`Play previous episode, season ${previousPosition.season}, episode ${previousPosition.episode}`}
        >
          <Ionicons name="play-skip-back" size={16} color="#fff" />
          <Text style={styles.episodeButtonText}>Previous</Text>
        </TouchableOpacity>
      )}

      {showNextEpisode && nextPosition && (
        <TouchableOpacity
          style={[styles.episodeButton, styles.nextEpisodeButton, { backgroundColor: colors.primary }]}
          onPress={goToNextEpisode}
          accessibilityRole="button"
          accessibilityLabel={`Play next episode, season ${nextPosition.season}, episode ${nextPosition.episode}`}
        >
          <Text style={styles.episodeButtonText}>Next Episode</Text>
          <Ionicons name="play-skip-forward" size={16} color="#fff" />
        </TouchableOpacity>
      )}

      {loading && (
        <View style={styles.loader}>
          <LoadingIndicator size="large" />
          <Text style={styles.loadingText}>Loading {provider}...</Text>
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
  hudContainer: {
    position: 'absolute',
    top: 64, // Positioned lower down
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 150,
  },
  hudCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 15, 15, 0.90)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  hudButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  hudDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  sourceText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  fitModeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  nextEpisodeButton: {
    position: 'absolute',
    right: 20,
    bottom: 32,
    zIndex: 200,
  },
  previousEpisodeButton: {
    position: 'absolute',
    left: 20,
    bottom: 32,
    zIndex: 200,
  },
  episodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(20, 20, 20, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  episodeButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
