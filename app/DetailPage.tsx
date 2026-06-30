import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Image,
  ActivityIndicator,
  StatusBar,
  Platform,
  ToastAndroid,
  Alert,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import {
  getImageUrl,
  getMovieGenres,
  getSimilarMedia,
  getSeasonEpisodes,
  getMovieImages,
  TMDBEpisode,
  TMDBImage,
  getMediaDetails,
  getExternalIds,
  getGeminiMoviesSimilarTo,
   GLOBAL_CONFIG 
} from '../src/tmdb';
import { getProgress } from '../src/utils/progress';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  FadeInDown,
  FadeIn,
  Extrapolate,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { STREAM_SOURCES, makeStreamUrl } from '../src/utils/sources';
import axios from 'axios';

// --- CONSTANTS ---
const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;
const IMAGE_SIZES = { THUMBNAIL: 'w154', POSTER_DETAIL: 'w780', STILL: 'w300', ORIGINAL: 'original' };

const C = {
  bg: '#0D0D0D',
  surface: '#161616',
  surface2: '#1F1F1F',
  border: '#2A2A2A',
  white: '#FFFFFF',
  muted: '#888888',
  accent: '#E50914',
  gold: '#FFD700',
  green: '#4CAF50',
  aiAccent: '#A78BFA', // purple for AI
};

// ─── LENS AI INSIGHT MODAL ───────────────────────────────────────────────────
// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const DetailPage = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  // 🎯 Reduced Height Multipliers
  const HEADER_HEIGHT = isLandscape ? height * 0.70 : height * 0.55;

  const { movie: initialMovie } = route.params as { movie: any };
  const [movie, setMovie] = useState(initialMovie);
  const [externalIds, setExternalIds] = useState<any>({});
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [autoAiEnabled, setAutoAiEnabled] = useState(true);
  const [workingSourceIndex, setWorkingSourceIndex] = useState(0);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [similarMovies, setSimilarMovies] = useState<any[]>([]);
  const [lastWatched, setLastWatched] = useState<any>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [lensInsight, setLensInsight] = useState<any>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);

  const scrollY = useSharedValue(0);

  const similarCardWidth = isTablet ? 160 : width * 0.32;
  const castCardWidth = isTablet ? 120 : width * 0.24;
  const episodeThumbWidth = isTablet ? 200 : width * 0.32;

  // --- EFFECTS ---
  useEffect(() => {
    AsyncStorage.getItem('settings_auto_ai').then(val => {
      if (val !== null) setAutoAiEnabled(JSON.parse(val));
    });
  }, []);

  const fetchAiRecommendations = async () => {
    if (!movie.title && !movie.name) return;
    setLoadingAi(true);
    const aiData = await getGeminiMoviesSimilarTo(movie.title || movie.name, movie.media_type, movie.id);
    setAiRecommendations(aiData);
    setLoadingAi(false);
  };

  const fetchLensInsight = async () => {
    if (!movie.title && !movie.name) return;
    setLensLoading(true);
    setLensError(null);
    setLensInsight(null);

    try {
      const response = await fetch('https://watcher-api-rho.vercel.app/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lens',
          title: movie.title || movie.name,
          mediaType: movie.media_type,
          year: (movie.release_date || movie.first_air_date)?.substring(0, 4) || '',
          overview: movie.overview?.slice(0, 500) || '',
          customApiKey: GLOBAL_CONFIG.customApiKey,
        }),
      });

      const data = await response.json();
      if (data?.result) {
        setLensInsight(data.result);
      } else {
        setLensError(data?.error || 'No insight returned.');
        console.error('Lens: no result in response', data);
      }
    } catch (e: any) {
      setLensError(e.message || 'Failed to fetch Lens insight.');
      console.error('Lens fetch failed:', e.message);
    } finally {
      setLensLoading(false);
    }
  };

  useEffect(() => {
    if (autoAiEnabled && (movie.title || movie.name)) {
      const task = requestIdleCallback(() => fetchAiRecommendations());
      return () => cancelIdleCallback(task);
    }
  }, [movie.id, autoAiEnabled]);

  useEffect(() => {
    if (externalIds && (externalIds.imdb_id || movie.id)) prefetchSources();
  }, [externalIds, movie.id]);

  const prefetchSources = async () => {
    setSourceStatus('checking');
    const tmdbId = movie.id;
    const imdbId = externalIds?.imdb_id;
    let foundWorking = false;
    for (let i = 0; i < STREAM_SOURCES.length; i++) {
      const source = STREAM_SOURCES[i];
      const testUrl = makeStreamUrl(source.url, movie.media_type, tmdbId, imdbId, 1, 1);
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(testUrl, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        clearTimeout(timeoutId);
        if (response.status === 200 || response.status === 302) {
          setWorkingSourceIndex(i);
          setSourceStatus('available');
          foundWorking = true;
          break;
        }
      } catch (e) {}
    }
    if (!foundWorking) {
      if (movie.media_type === 'movie' && !externalIds.imdb_id) setSourceStatus('unavailable');
      else { setSourceStatus('available'); setWorkingSourceIndex(0); }
    }
  };

  useEffect(() => {
    const task = requestIdleCallback(() => loadDeepDetails());
    return () => cancelIdleCallback(task);
  }, [initialMovie.id]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const checkProgress = async () => {
        const progress = await getProgress(movie.id);
        if (!isActive) return;
        setLastWatched(progress);
        if (progress && movie.media_type === 'tv') {
          setSelectedSeason(prev => {
            if (prev !== progress.lastSeason) {
              fetchEpisodes(progress.lastSeason);
              return progress.lastSeason;
            }
            return prev;
          });
        }
      };
      const task = requestIdleCallback(() => checkProgress());
      return () => { isActive = false; cancelIdleCallback(task); };
    }, [movie.id])
  );

  const loadDeepDetails = async () => {
    try {
      checkIfInWatchlist();
      checkIfWatched();
      const [fullDetails, , genresData, similarData, idsData] = await Promise.all([
        getMediaDetails(initialMovie.id, initialMovie.media_type),
        getMovieImages(initialMovie.id, initialMovie.media_type),
        getMovieGenres(initialMovie.id, initialMovie.media_type),
        getSimilarMedia(initialMovie.id, initialMovie.media_type),
        getExternalIds(initialMovie.id, initialMovie.media_type),
      ]);
      setMovie(fullDetails);
      setGenres(genresData);
      setSimilarMovies(similarData);
      setExternalIds(idsData);
      if (initialMovie.media_type === 'tv' && Array.isArray(fullDetails.seasons) && fullDetails.seasons.length > 0) {
        const storedProgress = await getProgress(initialMovie.id);
        let seasonToLoad = 1;
        if (storedProgress) {
          seasonToLoad = storedProgress.lastSeason;
        } else {
          const valid = fullDetails.seasons.filter((s: any) => s.season_number > 0);
          seasonToLoad = valid.length > 0 ? valid[0].season_number : fullDetails.seasons[0].season_number;
        }
        setSelectedSeason(seasonToLoad);
        fetchEpisodes(seasonToLoad);
      }
    } catch (e) {}
  };

  const fetchEpisodes = async (seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber);
      setEpisodes(data);
    } catch (e) {} finally { setLoadingEpisodes(false); }
  };

  // --- ACTIONS ---
  const handlePlay = (episode?: TMDBEpisode) => {
    if (sourceStatus === 'unavailable') {
      Alert.alert('Error', 'No streaming source found for this content.');
      return;
    }
    let targetSeason = 1, targetEpisode = 1;
    if (episode) {
      targetSeason = episode.season_number;
      targetEpisode = episode.episode_number;
    } else if (lastWatched && movie.media_type === 'tv') {
      targetSeason = lastWatched.lastSeason;
      targetEpisode = lastWatched.lastEpisode;
    } else if (movie.media_type === 'tv' && episodes.length > 0) {
      targetSeason = episodes[0].season_number;
      targetEpisode = episodes[0].episode_number;
    }
    navigation.navigate('Player', {
      tmdbId: movie.id, imdbId: externalIds.imdb_id,
      title: movie.title || movie.name, mediaType: movie.media_type,
      season: targetSeason, episode: targetEpisode,
      poster: movie.poster_path,
      episodeName: episode ? episode.name : `Episode ${targetEpisode}`,
      startIndex: workingSourceIndex,
    });
  };

  const checkIfInWatchlist = async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const list = stored ? JSON.parse(stored) : [];
      setIsInWatchlist(list.some((item: any) => item.id === movie.id));
    } catch (e) {}
  };

  const toggleWatchlist = async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const list = stored ? JSON.parse(stored) : [];
      const exists = list.some((item: any) => item.id === movie.id);
      const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie];
      await AsyncStorage.setItem('watchlist', JSON.stringify(newList));
      setIsInWatchlist(!exists);
      if (Platform.OS === 'android')
        ToastAndroid.show(exists ? 'Removed from Watchlist' : 'Added to Watchlist', ToastAndroid.SHORT);
    } catch (e) {}
  };

  const checkIfWatched = async () => {
    try {
      const stored = await AsyncStorage.getItem('history');
      const list = stored ? JSON.parse(stored) : [];
      setIsWatched(list.some((item: any) => item.id === movie.id));
    } catch (e) {}
  };

  const toggleWatched = async () => {
    try {
      const stored = await AsyncStorage.getItem('history');
      const list = stored ? JSON.parse(stored) : [];
      const exists = list.some((item: any) => item.id === movie.id);
      const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie];
      await AsyncStorage.setItem('history', JSON.stringify(newList));
      setIsWatched(!exists);
    } catch (e) {}
  };

  const openTelegramSearch = () => {
    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date)?.substring(0, 4) || '';
    const message = encodeURIComponent(`${title} ${year}`);
    Linking.openURL(`tg://msg?text=${message}`).catch(() => Linking.openURL(`https://t.me/share/url?text=${message}`));
  };

  const openTorrentSearch = () => {
    const query = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.slice(0, 4) || ''}`;
    navigation.navigate('Search', { screen: 'SearchMain', params: { prefillQuery: query } });
  };

  const copyTitle = async () => {
    const text = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.substring(0, 4) || ''}`;
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'android') ToastAndroid.show('Copied!', ToastAndroid.SHORT);
    else Alert.alert('Copied', text);
  };

  const scrollHandler = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [-120, 0], [1.15, 1], Extrapolate.CLAMP) }],
    opacity: interpolate(scrollY.value, [0, HEADER_HEIGHT * 0.45], [1, 0.3], Extrapolate.CLAMP),
  }));

  const displayTitle = movie.title || movie.name;
  const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0] || '';

  const getPlayLabel = () => {
    if (sourceStatus === 'checking') return 'Finding stream…';
    if (sourceStatus === 'unavailable') return 'Unavailable';
    if (movie.media_type === 'movie') return lastWatched ? 'Resume' : 'Watch Now';
    if (lastWatched) return `Resume S${lastWatched.lastSeason}:E${lastWatched.lastEpisode}`;
    return 'Start Watching';
  };

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── FLOATING TOP BAR ── */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.glassBtn}>
            <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* ── SCROLL CONTENT ── */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* HERO */}
        <View style={{ height: HEADER_HEIGHT }}>
          <Animated.Image
            source={{ uri: getImageUrl(movie.poster_path, IMAGE_SIZES.POSTER_DETAIL) }}
            style={[StyleSheet.absoluteFill, heroStyle]}
            resizeMode="cover"
          />
          {/* 🎯 Adjusted gradient locations to match the shorter height */}
          <LinearGradient
            colors={['transparent', 'rgba(13,13,13,0.4)', 'rgba(13,13,13,0.8)', C.bg]}
            locations={[0, 0.3, 0.6, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* ── CONTENT CARD ── */}
        <View style={styles.card}>

          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={3}>{displayTitle}</Text>
            <TouchableOpacity onPress={copyTitle} style={styles.copyBtn}>
              <Feather name="copy" size={18} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Meta pills */}
          <View style={styles.titleRow}>
          <View style={styles.metaRow}>
            {releaseYear ? <View style={styles.pill}><Text style={styles.pillText}>{releaseYear}</Text></View> : null}
            {movie.runtime > 0 && (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m</Text>
              </View>
            )}
            {movie.vote_average > 0 && (
              <View style={styles.pill}>
                <Ionicons name="star" size={11} color={C.gold} style={styles.pillstar} />
                <Text style={styles.pillText}>{movie.vote_average.toFixed(2)}</Text>
              </View>
            )}
            {movie.certification ? <View style={[styles.pill, styles.pillOutline]}><Text style={styles.pillText}>{movie.certification}</Text></View> : null}
            {movie.media_type === 'tv' && movie.number_of_seasons ? (
              <View style={styles.pill}><Text style={styles.pillText}>{movie.number_of_seasons} Seasons</Text></View>
            ) : null}
          </View>
          <TouchableOpacity onPress={toggleWatchlist} style={styles.glassBtn}>
            <Ionicons name={isInWatchlist ? 'heart' : 'heart-outline'} size={25} color={isInWatchlist ? C.accent : '#FFF'} />
          </TouchableOpacity>
          </View>

          {/* Genres */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreRow}>
            {genres.map((g, i) => (
              <TouchableOpacity
                key={g.id}
                onPress={() => navigation.navigate('ViewAll', { title: g.name, genreId: g.id, type: `genre/${g.id}`, data: [] })}
              >
                <Text style={styles.genreChip}>{g.name}{i < genres.length - 1 ? '  ·  ' : ''}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── PRIMARY PLAY BUTTON ── */}
          <TouchableOpacity
            style={[styles.playBtn, sourceStatus === 'unavailable' && styles.playBtnDisabled]}
            onPress={() => handlePlay()}
            disabled={sourceStatus !== 'available'}
            activeOpacity={0.85}
          >
            {sourceStatus === 'checking' ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name={lastWatched ? 'play-skip-forward' : 'play'} size={20} color="#000" />
            )}
            <Text style={styles.playBtnText}>{getPlayLabel()}</Text>
          </TouchableOpacity>

          {/* ── SECONDARY ACTION ROW ── */}
          <View style={styles.actionRow}>
            {/* LENS — AI Insight */}
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnLens]} onPress={fetchLensInsight}>
              <MaterialCommunityIcons name="creation" size={17} color={C.aiAccent} />
              <Text style={[styles.actionBtnText, { color: C.aiAccent }]}>Lens</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, isWatched && styles.actionBtnGreen]}
              onPress={toggleWatched}
            >
              <Ionicons name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'} size={17} color={isWatched ? C.green : C.muted} />
              <Text style={[styles.actionBtnText, isWatched && { color: C.green }]}>Watched</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={openTelegramSearch}>
              <Ionicons name="paper-plane-outline" size={17} color={C.muted} />
              <Text style={styles.actionBtnText}>Telegram</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={openTorrentSearch}>
              <Feather name="download" size={17} color={C.muted} />
              <Text style={styles.actionBtnText}>Torrent</Text>
            </TouchableOpacity>
          </View>

          {/* ── OVERVIEW ── */}
          <View style={styles.section}>
            <Text style={styles.overviewText}>
              {showFullOverview || (movie.overview?.length || 0) <= 200
                ? movie.overview
                : `${movie.overview?.slice(0, 200)}…`}
            </Text>
            {(movie.overview?.length || 0) > 200 && (
              <TouchableOpacity onPress={() => setShowFullOverview(!showFullOverview)}>
                <Text style={styles.readMore}>{showFullOverview ? 'Show less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.lensInlineCard}>
            <View style={styles.lensInlineHeader}>
              <MaterialCommunityIcons name="creation" size={16} color="#D97706" />
              <Text style={styles.lensInlineTitle}>Lens Insight</Text>
            </View>

            {lensLoading ? (
              <View style={styles.lensInlineLoading}>
                <ActivityIndicator color="#D97706" />
                <Text style={styles.lensInlineText}>Analyzing with Lens...</Text>
              </View>
            ) : lensError ? (
              <View style={styles.lensInlineMessage}>
                <Text style={styles.lensInlineText}>Could not load insight.</Text>
                <Text style={styles.lensInlineNote}>{lensError}</Text>
              </View>
            ) : lensInsight ? (
              <>
                <View style={[styles.lensInlineBadge, { borderColor: lensInsight.worthIt === 'Yes' ? C.green : lensInsight.worthIt === 'Maybe' ? C.gold : '#EF4444' }]}
                  >
                  <Text style={styles.lensInlineBadgeText}>
                    {lensInsight.worthIt === 'Yes' ? 'Worth Watching' : lensInsight.worthIt === 'Maybe' ? 'Maybe' : 'Skip It'}
                  </Text>
                </View>
                <Text style={styles.lensInlineReason}>{lensInsight.worthReason}</Text>
                <View style={styles.lensInlineField}>
                  <Text style={styles.lensInlineLabel}>Vibe</Text>
                  <Text style={styles.lensInlineValue}>{lensInsight.vibe}</Text>
                </View>
                <View style={styles.lensInlineField}>
                  <Text style={styles.lensInlineLabel}>What to Expect</Text>
                  <Text style={styles.lensInlineValue}>{lensInsight.expect}</Text>
                </View>
                {lensInsight.adultNote ? (
                  <Text style={styles.lensInlineNote}>{lensInsight.adultNote}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.lensInlineNote}>Tap Lens above to generate a quick AI overview.</Text>
            )}
          </View>

          {/* ── CAST ── */}
          {movie.cast && movie.cast.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Cast</Text>
              <FlatList
                horizontal
                data={movie.cast.slice(0, 12)}
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item, index }) => (
                  <Animated.View entering={FadeInDown.delay(index * 40)}>
                    <TouchableOpacity
                      style={[styles.castCard, { width: castCardWidth }]}
                      onPress={() => navigation.push('CastDetails', { personId: item.id })}
                    >
                      <Image
                        source={{ uri: item.profile_path ? getImageUrl(item.profile_path, IMAGE_SIZES.THUMBNAIL) : 'https://via.placeholder.com/150' }}
                        style={[styles.castImg, { width: castCardWidth, height: castCardWidth * 1.4 }]}
                      />
                      <Text style={styles.castName} numberOfLines={2}>{item.name}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                )}
              />
            </View>
          )}

          {/* ── EPISODES ── */}
          {movie.media_type === 'tv' && movie.seasons && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Episodes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
                {movie.seasons.filter((s: any) => s.season_number > 0).map((s: any) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.seasonPill, selectedSeason === s.season_number && styles.seasonPillActive]}
                    onPress={() => { setSelectedSeason(s.season_number); fetchEpisodes(s.season_number); }}
                  >
                    <Text style={[styles.seasonPillText, selectedSeason === s.season_number && styles.seasonPillTextActive]}>{s.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {loadingEpisodes ? <ActivityIndicator color={C.accent} /> : (
                episodes.map(ep => {
                  const isActive = lastWatched?.lastSeason === ep.season_number && lastWatched?.lastEpisode === ep.episode_number;
                  return (
                    <TouchableOpacity
                      key={ep.id}
                      style={[styles.epRow, isActive && styles.epRowActive]}
                      onPress={() => handlePlay(ep)}
                      activeOpacity={0.75}
                    >
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: ep.still_path ? getImageUrl(ep.still_path, IMAGE_SIZES.STILL) : 'https://via.placeholder.com/100' }}
                          style={[styles.epThumb, { width: episodeThumbWidth, height: episodeThumbWidth * 0.56 }]}
                        />
                        <View style={styles.epPlayOverlay}>
                          <Ionicons name="play" size={18} color="#FFF" />
                        </View>
                        {isActive && (
                          <View style={styles.epActiveDot} />
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.epNum, isActive && { color: C.accent }]}>E{ep.episode_number}</Text>
                        <Text style={styles.epTitle} numberOfLines={2}>{ep.name}</Text>
                        <Text style={styles.epOverview} numberOfLines={2}>{ep.overview}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* ── VIBE MATCH AI ── */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="creation" size={16} color={C.gold} />
              <Text style={[styles.sectionTitle, { color: C.gold, marginBottom: 0, marginLeft: 6 }]}>Vibe Match</Text>
            </View>

            {!autoAiEnabled && aiRecommendations.length === 0 && !loadingAi && (
              <TouchableOpacity style={styles.vibeBtn} onPress={fetchAiRecommendations}>
                <Text style={styles.vibeBtnText}>Generate Suggestions</Text>
              </TouchableOpacity>
            )}

            {loadingAi ? <ActivityIndicator color={C.gold} style={{ marginTop: 16 }} /> : (
              aiRecommendations.length > 0 && (
                <FlatList
                  horizontal
                  data={aiRecommendations}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(_, i) => String(i)}
                  renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInDown.delay(index * 80)}>
                      <TouchableOpacity
                        style={[styles.similarCard, { width: similarCardWidth }]}
                        onPress={() => navigation.push('Detail', { movie: item })}
                      >
                        <Image
                          source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }}
                          style={[styles.similarImg, { width: similarCardWidth, height: similarCardWidth * 1.5 }]}
                        />
                        <View style={styles.ratingBadge}>
                          <Ionicons name="star" size={9} color={C.gold} />
                          <Text style={styles.ratingText}>{item.vote_average?.toFixed(1)}</Text>
                        </View>
                        <Text style={styles.similarTitle} numberOfLines={2}>{item.title || item.name}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  )}
                />
              )
            )}
          </View>

          {/* ── MORE LIKE THIS ── */}
          {similarMovies.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>More Like This</Text>
              <FlatList
                horizontal
                data={similarMovies}
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.similarCard, { width: similarCardWidth }]}
                    onPress={() => navigation.push('Detail', { movie: item })}
                  >
                    <Image
                      source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }}
                      style={[styles.similarImg, { width: similarCardWidth, height: similarCardWidth * 1.5 }]}
                    />
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={9} color={C.gold} />
                      <Text style={styles.ratingText}>{item.vote_average?.toFixed(1)}</Text>
                    </View>
                    <Text style={styles.similarTitle} numberOfLines={2}>{item.title || item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      </Animated.ScrollView>

    </View>
  );
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Top bar
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, zIndex: 100,
  },
  glassBtn: { borderRadius: 20, overflow: 'hidden' },
  glassBtnInner: { padding: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.25)' },

  // Hero
  heroBadge: {
    position: 'absolute', top: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  heroBadgeText: { color: C.gold, fontSize: 12, fontWeight: '700' },

  // Card (the scrollable content below hero)
  card: {
    marginTop: -32,
    backgroundColor: C.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  // Title
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',marginBottom: 10 },
  title: { flex: 1, fontSize: 28, fontWeight: '800', color: C.white, lineHeight: 34, letterSpacing: -0.5 },
  copyBtn: { padding: 6, marginTop: 2 },

  // Meta pills
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, },
  pill: { backgroundColor: C.surface2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection:'row',gap:'3' },
  pillOutline: { borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' },
  pillText: { color: C.muted, fontSize: 12, fontWeight: '600' , alignSelf:'center' },
  pillstar:{
    alignSelf:'center',
    paddingVertical: 5
  },

  // Genre
  genreRow: { marginBottom: 22 },
  genreChip: { color: C.muted, fontSize: 13, fontWeight: '500' },

  // Play button — full width, prominent
  playBtn: {
    backgroundColor: C.white,
    borderRadius: 14,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  playBtnDisabled: { backgroundColor: C.surface2, opacity: 0.6 },
  playBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  // Secondary action row
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: C.surface,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnLens: {
    borderColor: 'rgba(167, 139, 250, 0.35)',
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
  },
  actionBtnGreen: {
    borderColor: 'rgba(76, 175, 80, 0.35)',
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
  },
  actionBtnText: { color: C.muted, fontSize: 11, fontWeight: '600' },

  // Overview
  section: { marginBottom: 32 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 18, color: C.white, fontWeight: '700', marginBottom: 14 },
  overviewText: { color: '#C0C0C0', fontSize: 14, lineHeight: 22 },
  readMore: { color: C.accent, fontWeight: '700', marginTop: 6, fontSize: 13 },

  // Cast
  castCard: { marginRight: 12 },
  castImg: { borderRadius: 12, backgroundColor: C.surface2, marginBottom: 6 },
  castName: { color: '#CCC', fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // Season pills
  seasonPill: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: C.surface2,
    borderWidth: 1, borderColor: 'transparent',
  },
  seasonPillActive: { borderColor: C.white },
  seasonPillText: { color: C.muted, fontSize: 13, fontWeight: '500' },
  seasonPillTextActive: { color: C.white, fontWeight: '700' },

  // Episodes
  epRow: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    marginBottom: 14, padding: 8, borderRadius: 14,
    backgroundColor: C.surface,
  },
  epRowActive: { borderWidth: 1, borderColor: 'rgba(229,9,20,0.4)', backgroundColor: 'rgba(229,9,20,0.06)' },
  epThumb: { borderRadius: 10, backgroundColor: C.surface2 },
  epPlayOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10,
  },
  epActiveDot: {
    position: 'absolute', top: 6, left: 6,
    width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent,
  },
  epNum: { color: C.muted, fontSize: 11, fontWeight: '700', marginBottom: 2 },
  epTitle: { color: C.white, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  epOverview: { color: C.muted, fontSize: 11, lineHeight: 16 },

  // Similar / Vibe
  vibeBtn: {
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderWidth: 1, borderColor: C.gold,
    borderRadius: 14, paddingVertical: 14,
    alignItems: 'center',
  },
  vibeBtnText: { color: C.gold, fontWeight: '700', fontSize: 14 },
  similarCard: { marginRight: 12 },
  similarImg: { borderRadius: 12, backgroundColor: C.surface2 },
  similarTitle: { color: C.white, fontSize: 12, fontWeight: '600', marginTop: 8, lineHeight: 17 },
  ratingBadge: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  ratingText: { color: C.white, fontSize: 10, fontWeight: '700' },

  lensInlineCard: {
    backgroundColor: '#F59E0B',
    borderRadius: 20,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  lensInlineHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  lensInlineTitle: { color: '#92400E', fontSize: 16, fontWeight: '800' },
  lensInlineLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  lensInlineMessage: { paddingVertical: 8 },
  lensInlineText: { color: '#6B2100', fontSize: 13 },
  lensInlineNote: { color: '#78350F', fontSize: 12, marginTop: 6, lineHeight: 18 },
  lensInlineBadge: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignSelf: 'flex-start',
  },
  lensInlineBadgeText: { color: '#92400E', fontSize: 13, fontWeight: '700' },
  lensInlineReason: { color: '#6B2100', fontSize: 14, marginBottom: 12, lineHeight: 20 },
  lensInlineField: { marginBottom: 12 },
  lensInlineLabel: { color: '#78350F', fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase' },
  lensInlineValue: { color: '#4B250E', fontSize: 14, lineHeight: 20 },

  // ── LENS MODAL ──
  lensOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  lensSheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingBottom: 40,
    maxHeight: '85%',
  },
  lensHandle: {
    width: 36, height: 4, backgroundColor: C.border,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 20,
  },
  lensHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  lensHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lensTitle: { color: C.aiAccent, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  lensClose: { padding: 4 },
  lensSubtitle: { color: C.muted, fontSize: 13, marginBottom: 20 },
  lensLoader: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  lensLoadingText: { color: C.muted, fontSize: 13 },

  lensWorthBadge: {
    borderWidth: 1, borderRadius: 16,
    padding: 16, marginBottom: 20,
  },
  lensWorthLabel: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  lensWorthReason: { color: '#CCC', fontSize: 13, lineHeight: 20 },

  lensBlock: { marginBottom: 18 },
  lensBlockLabel: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  lensBlockValue: { color: C.white, fontSize: 15, fontWeight: '600' },
  lensBodyText: { color: '#CCC', fontSize: 13, lineHeight: 20 },

  lensFlags: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  lensFlagPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: C.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: C.border,
  },
  lensFlagActive: { borderColor: 'rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.08)' },
  lensFlagGoreActive: { borderColor: 'rgba(249,115,22,0.4)', backgroundColor: 'rgba(249,115,22,0.08)' },
  lensFlagText: { fontSize: 12, fontWeight: '600' },
  lensNote: { color: C.muted, fontSize: 12, marginBottom: 18, marginTop: 4 },

  lensRefetch: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', marginTop: 8, padding: 8,
  },
  lensRefetchText: { color: C.aiAccent, fontSize: 13, fontWeight: '600' },
});

export default DetailPage;