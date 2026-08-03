// app/DetailPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
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
  getMediaDetails,
  getExternalIds,
  getGeminiMoviesSimilarTo,
  GLOBAL_CONFIG,
} from '../src/tmdb';
import { getProgress } from '../src/utils/progress';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';




const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;
const IMAGE_SIZES = { THUMBNAIL: 'w154', POSTER_DETAIL: 'w780', STILL: 'w300', ORIGINAL: 'original' };

const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  accent: '#F5F5F7',
  red: '#FF453A',
  gold: '#FFD60A',
  green: '#30D158',
  ai: '#C9A9FF',
  aiSoft: 'rgba(201,169,255,0.10)',
  aiBorder: 'rgba(201,169,255,0.28)',
};

// --- SHIMMER & LOADING COMPONENTS ---

const AIShimmerBar = ({ width: w = '100%', height = 12 }: any) => (
  <View style={[{ width: w, height, borderRadius: 6, backgroundColor: C.aiSoft, marginBottom: 8 }]} />
);

const ShimmerBlock = React.memo(({ width, height, borderRadius = 8, style }: any) => (
  <View style={[{ width, height, borderRadius, backgroundColor: C.surface2 }, style]} />
));

const EpisodeShimmer = React.memo(({ thumbWidth }: any) => (
  <View style={[styles.epRow, { borderColor: 'transparent' }]}>
    <ShimmerBlock width={thumbWidth} height={thumbWidth * 0.56} borderRadius={10} />
    <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
      <ShimmerBlock width="35%" height={10} />
      <ShimmerBlock width="85%" height={14} />
      <ShimmerBlock width="100%" height={12} />
      <ShimmerBlock width="60%" height={12} />
    </View>
  </View>
));

const CardShimmer = React.memo(({ width, height }: any) => (
  <View style={{ width, marginRight: 12 }}>
    <ShimmerBlock width={width} height={height} borderRadius={12} />
    <View style={{ marginTop: 8, gap: 6 }}>
      <ShimmerBlock width="80%" height={12} />
      <ShimmerBlock width="50%" height={10} />
    </View>
  </View>
));

const DirectorShimmer = React.memo(() => (
  <View style={[styles.directorCard, { paddingRight: 16, borderColor: 'transparent', marginRight: 12 }]}>
    <ShimmerBlock width={40} height={40} borderRadius={20} />
    <View style={{ gap: 6 }}>
      <ShimmerBlock width={60} height={12} />
      <ShimmerBlock width={40} height={10} />
    </View>
  </View>
));

// --- MEMOIZED RENDER COMPONENTS ---

const MemoizedSimilarCard = React.memo(({ item, cardWidth, onPress }: any) => (
  <TouchableOpacity
    style={[styles.similarCard, { width: cardWidth }]}
    onPress={() => onPress(item)}
    activeOpacity={0.55}
  >
    <Image
      source={{ uri: getImageUrl(item.poster_path, IMAGE_SIZES.THUMBNAIL) }}
      style={[styles.similarImg, { width: cardWidth, height: cardWidth * 1.5 }]}
    />
    <View style={styles.ratingBadge}>
      <Ionicons name="star" size={9} color={C.gold} />
      <Text style={styles.ratingText}>{item.vote_average?.toFixed(1)}</Text>
    </View>
    <Text style={styles.similarTitle} numberOfLines={2}>
      {item.title || item.name}
    </Text>
  </TouchableOpacity>
));

const MemoizedDirectorCard = React.memo(({ item, mediaType, onPress }: any) => (
  <View>
    <TouchableOpacity
      style={styles.directorCard}
      onPress={() => onPress(item.id)}
      activeOpacity={0.55}
    >
      <Image
        source={{
          uri: item.profile_path
            ? getImageUrl(item.profile_path, IMAGE_SIZES.THUMBNAIL)
            : 'https://via.placeholder.com/150',
        }}
        style={styles.directorImg}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.directorName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.directorRole} numberOfLines={1}>
          {item.role || (mediaType === 'tv' ? 'Creator' : 'Director')}
        </Text>
      </View>
    </TouchableOpacity>
  </View>
));

const MemoizedCastCard = React.memo(({ item, cardWidth, onPress }: any) => (
  <View>
    <TouchableOpacity
      style={{ width: cardWidth }}
      onPress={() => onPress(item.id)}
      activeOpacity={0.55}
    >
      <Image
        source={{
          uri: item.profile_path
            ? getImageUrl(item.profile_path, IMAGE_SIZES.THUMBNAIL)
            : 'https://via.placeholder.com/150',
        }}
        style={[styles.castImg, { width: cardWidth, height: cardWidth * 1.35 }]}
      />
      <Text style={styles.castName} numberOfLines={1}>
        {item.name}
      </Text>
      {item.character ? (
        <Text style={styles.castCharacter} numberOfLines={1}>
          {item.character}
        </Text>
      ) : null}
    </TouchableOpacity>
  </View>
));

const MemoizedEpisodeRow = React.memo(({ ep, isActive, episodeThumbWidth, onPlay }: any) => (
  <View>
    <TouchableOpacity
      style={[styles.epRow, isActive && styles.epRowActive]}
      onPress={() => onPlay(ep)}
      activeOpacity={0.75}
    >
      <View style={{ position: 'relative' }}>
        <Image
          source={{
            uri: ep.still_path
              ? getImageUrl(ep.still_path, IMAGE_SIZES.STILL)
              : 'https://via.placeholder.com/100',
          }}
          style={[styles.epThumb, { width: episodeThumbWidth, height: episodeThumbWidth * 0.56 }]}
        />
        <View style={styles.epPlayOverlay}>
          <Ionicons name="play" size={16} color="#FFF" />
        </View>
        {isActive && <View style={styles.epActiveDot} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.epNum, isActive && { color: C.gold }]}>
          EPISODE {ep.episode_number}
        </Text>
        <Text style={styles.epTitle} numberOfLines={1}>
          {ep.name}
        </Text>
        <Text style={styles.epOverview} numberOfLines={2}>
          {ep.overview}
        </Text>
      </View>
    </TouchableOpacity>
  </View>
), (prev, next) => prev.isActive === next.isActive && prev.ep.id === next.ep.id && prev.episodeThumbWidth === next.episodeThumbWidth);


// --- MAIN COMPONENT ---

const DetailPage = () => {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const HEADER_HEIGHT = isLandscape ? height * 0.7 : height * 0.62;

  const { movie: initialMovie } = route.params as { movie: any };
  const [movie, setMovie] = useState(initialMovie);
  const [externalIds, setExternalIds] = useState<any>({});
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [autoAiEnabled, setAutoAiEnabled] = useState(true);
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
  const [aiTab, setAiTab] = useState<'lens' | 'vibe'>('lens');
  const [directors, setDirectors] = useState<any[]>([]);

  const similarCardWidth = isTablet ? 160 : width * 0.3;
  const castCardWidth = isTablet ? 120 : width * 0.26;
  const episodeThumbWidth = isTablet ? 200 : width * 0.34;

  useEffect(() => {
    AsyncStorage.getItem('settings_auto_ai').then((val) => {
      if (val !== null) setAutoAiEnabled(JSON.parse(val));
    });
  }, []);

  const fetchAiRecommendations = async () => {
    if (!movie.title && !movie.name) return;
    setLoadingAi(true);
    const aiData = await getGeminiMoviesSimilarTo(
      movie.title || movie.name,
      movie.media_type,
      movie.id,
    );
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
      if (data?.result) setLensInsight(data.result);
      else setLensError(data?.error || 'No insight returned.');
    } catch (e: any) {
      setLensError(e.message || 'Failed to fetch Lens insight.');
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

  // 🎯 Replaces old source checking logic with direct Vercel API check
  const prefetchSources = useCallback(async (seasonToTry = 1, episodeToTry = 1) => {
    setSourceStatus('checking');
    try {
      const baseUrl = "https://watcher-api-rho.vercel.app";
      const encodedTitle = encodeURIComponent(movie.title || movie.name || '');
      const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${movie.id}&media_type=${movie.media_type}&title=${encodedTitle}&season=${seasonToTry}&episode=${episodeToTry}`;

      const response = await fetch(endpoint);
      const data = await response.json();

      if (data.status === "success" && data.stream_url) {
        setSourceStatus('available');
      } else {
        setSourceStatus('unavailable');
      }
    } catch (e) {
      setSourceStatus('unavailable');
    }
  }, [movie]);

  useEffect(() => {
    if (movie.id) {
        let s = 1, e = 1;
        if (movie.media_type === 'tv') {
            s = lastWatched?.lastSeason || 1;
            e = lastWatched?.lastEpisode || 1;
        }
        prefetchSources(s, e);
    }
  }, [movie.id, lastWatched, prefetchSources]);

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
          setSelectedSeason((prev) => {
            if (prev !== progress.lastSeason) {
              fetchEpisodes(progress.lastSeason);
              return progress.lastSeason;
            }
            return prev;
          });
        }
      };
      const task = requestIdleCallback(() => checkProgress());
      return () => {
        isActive = false;
        cancelIdleCallback(task);
      };
    }, [movie.id]),
  );

  const loadDeepDetails = async () => {
    setLoadingDetails(true);
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

      const detailData = fullDetails as any;
      const merged: any[] = [];

      if (detailData?.director) {
        merged.push({
          ...detailData.director,
          role: detailData.director.job || (initialMovie.media_type === 'tv' ? 'Creator' : 'Director'),
        });
      }

      const crew = detailData?.crew || detailData?.credits?.crew || [];
      const creators = detailData?.created_by || [];
      const dirFromCrew = crew.filter(
        (p: any) => p.job === 'Director' || p.department === 'Directing',
      );

      [...creators, ...dirFromCrew].forEach((person: any) => {
        if (!person?.id) return;
        if (!merged.find((entry) => entry.id === person.id)) {
          merged.push({
            ...person,
            role: person.job || (initialMovie.media_type === 'tv' ? 'Creator' : 'Director'),
          });
        }
      });

      setDirectors(merged);

      if (
        initialMovie.media_type === 'tv' &&
        Array.isArray(fullDetails.seasons) &&
        fullDetails.seasons.length > 0
      ) {
        const storedProgress = await getProgress(initialMovie.id);
        let seasonToLoad = 1;
        if (storedProgress) seasonToLoad = storedProgress.lastSeason;
        else {
          const valid = fullDetails.seasons.filter((s: any) => s.season_number > 0);
          seasonToLoad = valid.length > 0 ? valid[0].season_number : fullDetails.seasons[0].season_number;
        }
        setSelectedSeason(seasonToLoad);
        fetchEpisodes(seasonToLoad);
      }
    } catch {}
    finally {
      setLoadingDetails(false);
    }
  };

  const fetchEpisodes = async (seasonNumber: number) => {
    setLoadingEpisodes(true);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber);
      setEpisodes(data);
    } catch {}
    finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlay = useCallback((episode?: TMDBEpisode) => {
    if (sourceStatus === 'unavailable') {
      Alert.alert('Unavailable', 'No streaming source found for this content.');
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
      tmdbId: movie.id,
      imdbId: externalIds.imdb_id,
      title: movie.title || movie.name,
      mediaType: movie.media_type,
      season: targetSeason,
      episode: targetEpisode,
      poster: movie.poster_path,
      episodeName: episode ? episode.name : `Episode ${targetEpisode}`,
    });
  }, [sourceStatus, movie, externalIds, lastWatched, episodes, navigation]);

  const checkIfInWatchlist = async () => {
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const list = stored ? JSON.parse(stored) : [];
      setIsInWatchlist(list.some((item: any) => item.id === movie.id));
    } catch {}
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
    } catch {}
  };

  const checkIfWatched = async () => {
    try {
      const stored = await AsyncStorage.getItem('history');
      const list = stored ? JSON.parse(stored) : [];
      setIsWatched(list.some((item: any) => item.id === movie.id));
    } catch {}
  };

  const toggleWatched = async () => {
    try {
      const stored = await AsyncStorage.getItem('history');
      const list = stored ? JSON.parse(stored) : [];
      const exists = list.some((item: any) => item.id === movie.id);
      const newList = exists ? list.filter((item: any) => item.id !== movie.id) : [...list, movie];
      await AsyncStorage.setItem('history', JSON.stringify(newList));
      setIsWatched(!exists);
    } catch {}
  };

  const openTelegramSearch = () => {
    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date)?.substring(0, 4) || '';
    const message = encodeURIComponent(`${title} ${year}`);
    Linking.openURL(`tg://msg?text=${message}`).catch(() =>
      Linking.openURL(`https://t.me/share/url?text=${message}`),
    );
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

  const displayTitle = movie.title || movie.name;
  const releaseYear = (movie.release_date || movie.first_air_date)?.split('-')[0] || '';

  const getPlayLabel = () => {
    if (sourceStatus === 'checking') return 'Finding stream';
    if (sourceStatus === 'unavailable') return 'Unavailable';
    if (movie.media_type === 'movie') return lastWatched ? 'Resume' : 'Play';
    if (lastWatched) return `Resume S${lastWatched.lastSeason} · E${lastWatched.lastEpisode}`;
    return 'Play';
  };

  // --- RENDERING HELPERS FOR MEMOIZATION ---

  const keyExtractorId = useCallback((item: any) => String(item.id), []);

  const getSimilarItemLayout = useCallback((_: any, index: number) => ({
    length: similarCardWidth + 12, offset: (similarCardWidth + 12) * index, index,
  }), [similarCardWidth]);

  const getCastItemLayout = useCallback((_: any, index: number) => ({
    length: castCardWidth + 12, offset: (castCardWidth + 12) * index, index,
  }), [castCardWidth]);

  const handleMoviePress = useCallback((item: any) => navigation.push('Detail', { movie: item }), [navigation]);
  const handlePersonPress = useCallback((id: string) => navigation.push('CastDetails', { personId: id }), [navigation]);

  const renderAiItem = useCallback(({ item, index }: any) => (
    <MemoizedSimilarCard item={item} index={index} cardWidth={similarCardWidth} onPress={handleMoviePress} />
  ), [similarCardWidth, handleMoviePress]);

  const renderDirectorItem = useCallback(({ item, index }: any) => (
    <MemoizedDirectorCard item={item} index={index} mediaType={movie.media_type} onPress={handlePersonPress} />
  ), [movie.media_type, handlePersonPress]);

  const renderCastItem = useCallback(({ item, index }: any) => (
    <MemoizedCastCard item={item} index={index} cardWidth={castCardWidth} onPress={handlePersonPress} />
  ), [castCardWidth, handlePersonPress]);

  const renderSimilarMovieItem = useCallback(({ item, index }: any) => (
    <MemoizedSimilarCard item={item} index={index} cardWidth={similarCardWidth} onPress={handleMoviePress} />
  ), [similarCardWidth, handleMoviePress]);


  // --- LIST HEADER COMPONENT (Everything above episodes) ---
  const renderHeader = () => (
    <>
      <View style={{ height: HEADER_HEIGHT, overflow: 'hidden' }}>
        <Image
          source={{ uri: getImageUrl(movie.poster_path, IMAGE_SIZES.POSTER_DETAIL) }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(10,10,11,0.15)', 'transparent', 'rgba(10,10,11,0.6)', C.bg]}
          locations={[0, 0.35, 0.75, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <View style={styles.cardTop}>
        {releaseYear ? (
          <Text style={styles.heroEyebrow}>
            {movie.media_type === 'tv' ? 'SERIES' : 'FILM'} · {releaseYear}
          </Text>
        ) : null}
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={3}>
            {displayTitle}
          </Text>
          <TouchableOpacity onPress={copyTitle} style={styles.copyBtn}>
            <Feather name="copy" size={16} color={C.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.metaRow}>
          {releaseYear ? <Text style={styles.metaText}>{releaseYear}</Text> : null}
          {movie.runtime > 0 && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>
                {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
              </Text>
            </>
          )}
          {movie.vote_average > 0 && (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Ionicons name="star" size={11} color={C.gold} />
              <Text style={[styles.metaText, { marginLeft: 4 }]}>{movie.vote_average.toFixed(1)}</Text>
            </>
          )}
          {movie.certification ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <View style={styles.certPill}>
                <Text style={styles.certText}>{movie.certification}</Text>
              </View>
            </>
          ) : null}
          {movie.media_type === 'tv' && movie.number_of_seasons ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{movie.number_of_seasons} Seasons</Text>
            </>
          ) : null}
        </View>

        {genres.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreRow} contentContainerStyle={{ gap: 6 }}>
            {genres.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.genreChip}
                onPress={() => navigation.navigate('ViewAll', { title: g.name, genreId: g.id, type: `genre/${g.id}`, data: [] })}
              >
                <Text style={styles.genreChipText}>{g.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[styles.playBtn, sourceStatus === 'unavailable' && styles.playBtnDisabled]}
          onPress={() => handlePlay()}
          disabled={sourceStatus !== 'available'}
          activeOpacity={0.5}
        >
          {sourceStatus === 'checking' ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <Ionicons name={lastWatched ? 'play-skip-forward' : 'play'} size={20} color="#000" />
          )}
          <Text style={styles.playBtnText}>{getPlayLabel()}</Text>
        </TouchableOpacity>
        



        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, isInWatchlist && styles.actionBtnActive]} onPress={toggleWatchlist}>
            <Ionicons name={isInWatchlist ? 'bookmark' : 'bookmark-outline'} size={18} color={isInWatchlist ? C.gold : C.white} />
            <Text style={[styles.actionBtnText, isInWatchlist && { color: C.gold }]}>Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, isWatched && styles.actionBtnActive]} onPress={toggleWatched}>
            <Ionicons name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'} size={18} color={isWatched ? C.green : C.mutedSoft} />
            <Text style={[styles.actionBtnText, isWatched && { color: C.green }]}>Watched</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={openTelegramSearch}>
            <Ionicons name="paper-plane-outline" size={17} color={C.mutedSoft} />
            <Text style={styles.actionBtnText}>Telegram</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={openTorrentSearch}>
            <Feather name="download" size={17} color={C.mutedSoft} />
            <Text style={styles.actionBtnText}>Torrent</Text>
          </TouchableOpacity>
        </View>

        {movie.overview ? (
          <View style={styles.section}>
            <Text style={styles.overviewText}>
              {showFullOverview || movie.overview.length <= 220 ? movie.overview : `${movie.overview.slice(0, 220)}…`}
            </Text>
            {movie.overview.length > 220 && (
              <TouchableOpacity onPress={() => setShowFullOverview(!showFullOverview)}>
                <Text style={styles.readMore}>{showFullOverview ? 'Less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        <View style={styles.aiPanel}>
          <View style={styles.aiHeader}>
            <View style={styles.aiHeaderLeft}>
              <MaterialCommunityIcons name="creation" size={18} color={C.ai} />
              <Text style={styles.aiHeaderTitle}>AI Insights</Text>
            </View>
            <View style={styles.aiTabs}>
              <TouchableOpacity style={[styles.aiTab, aiTab === 'lens' && styles.aiTabActive]} onPress={() => { setAiTab('lens'); if (!lensInsight && !lensLoading) fetchLensInsight(); }}>
                <Text style={[styles.aiTabText, aiTab === 'lens' && styles.aiTabTextActive]}>Lens</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.aiTab, aiTab === 'vibe' && styles.aiTabActive]} onPress={() => setAiTab('vibe')}>
                <Text style={[styles.aiTabText, aiTab === 'vibe' && styles.aiTabTextActive]}>Vibe</Text>
              </TouchableOpacity>
            </View>
          </View>

          {aiTab === 'lens' ? (
            <View>
              {lensLoading ? (
                <View style={{ paddingTop: 6 }}>
                  <AIShimmerBar width="40%" height={14} delay={0} />
                  <AIShimmerBar width="100%" delay={80} />
                  <AIShimmerBar width="92%" delay={160} />
                  <AIShimmerBar width="70%" delay={240} />
                </View>
              ) : lensError ? (
                <View>
                  <Text style={styles.aiErrorText}>Couldn't load insight.</Text>
                  <TouchableOpacity onPress={fetchLensInsight} style={styles.aiRetry}>
                    <Feather name="rotate-cw" size={13} color={C.ai} />
                    <Text style={styles.aiRetryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : lensInsight ? (
                <View>
                  <View style={styles.aiVerdictPill}>
                    <View style={styles.aiVerdictDot} />
                    <Text style={styles.aiVerdictText}>{lensInsight.worthIt}</Text>
                  </View>
                  <Text style={styles.aiFriendVerdict}>
                    "{lensInsight.friendVerdict}"
                  </Text>
                  {[
                    { label: 'Vibe', value: lensInsight.vibe, delay: 160 },
                    { label: "What it's really about", value: lensInsight.whatItsActuallyAbout, delay: 240 },
                    { label: "What you'll see", value: lensInsight.whatYoullSee, delay: 320 },
                  ].map((row) => row.value ? (
                      <View key={row.label} style={styles.aiField}>
                        <Text style={styles.aiFieldLabel}>{row.label}</Text>
                        <Text style={styles.aiFieldValue}>{row.value}</Text>
                      </View>
                    ) : null,
                  )}
                  {lensInsight.spoilerOverview ? (
                    <View style={styles.aiSpoiler}>
                      <Text style={styles.aiSpoilerLabel}>⚠ Spoilers</Text>
                      <Text style={styles.aiFieldValue}>{lensInsight.spoilerOverview}</Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <TouchableOpacity onPress={fetchLensInsight} style={styles.aiGenerateBtn}>
                  <MaterialCommunityIcons name="creation" size={16} color={C.ai} />
                  <Text style={styles.aiGenerateText}>Generate Lens insight</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View>
              {loadingAi ? (
                <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
                  {[1, 2, 3].map((i) => <View key={i} style={{ flex: 1 }}><CardShimmer width="100%" height={similarCardWidth * 1.5} /></View>)}
                </View>
              ) : aiRecommendations.length > 0 ? (
                <FlatList
                  horizontal
                  data={aiRecommendations}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={keyExtractorId}
                  contentContainerStyle={{ paddingTop: 4 }}
                  renderItem={renderAiItem}
                  initialNumToRender={4}
                  maxToRenderPerBatch={4}
                  windowSize={3}
                  removeClippedSubviews={true}
                  getItemLayout={getSimilarItemLayout}
                />
              ) : (
                <TouchableOpacity onPress={fetchAiRecommendations} style={styles.aiGenerateBtn}>
                  <MaterialCommunityIcons name="creation" size={16} color={C.ai} />
                  <Text style={styles.aiGenerateText}>Find similar vibes</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {loadingDetails ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{movie.media_type === 'tv' ? 'Created by' : 'Directed by'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3].map((i) => <DirectorShimmer key={i} />)}
            </ScrollView>
          </View>
        ) : directors.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {movie.media_type === 'tv' ? 'Created by' : 'Directed by'}
            </Text>
            <FlatList
              horizontal
              data={directors}
              showsHorizontalScrollIndicator={false}
              keyExtractor={keyExtractorId}
              contentContainerStyle={{ gap: 12 }}
              renderItem={renderDirectorItem}
              initialNumToRender={3}
              maxToRenderPerBatch={4}
              windowSize={3}
              removeClippedSubviews={true}
            />
          </View>
        )}

        {loadingDetails ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {[1, 2, 3, 4].map((i) => <CardShimmer key={i} width={castCardWidth} height={castCardWidth * 1.35} />)}
            </ScrollView>
          </View>
        ) : movie.cast && movie.cast.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            <FlatList
              horizontal
              data={movie.cast.slice(0, 15)}
              showsHorizontalScrollIndicator={false}
              keyExtractor={keyExtractorId}
              contentContainerStyle={{ gap: 12 }}
              renderItem={renderCastItem}
              initialNumToRender={4}
              maxToRenderPerBatch={4}
              windowSize={3}
              removeClippedSubviews={true}
              getItemLayout={getCastItemLayout}
            />
          </View>
        )}

        {movie.media_type === 'tv' && movie.seasons && (
          <View style={{ marginBottom: 14 }}>
            <Text style={styles.sectionTitle}>Episodes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
              {movie.seasons.filter((s: any) => s.season_number > 0).map((s: any) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.seasonPill, selectedSeason === s.season_number && styles.seasonPillActive]}
                    onPress={() => { setSelectedSeason(s.season_number); fetchEpisodes(s.season_number); }}
                  >
                    <Text style={[styles.seasonPillText, selectedSeason === s.season_number && styles.seasonPillTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            
            {loadingEpisodes && (
              <View style={{ marginTop: 10, gap: 10 }}>
                {[1, 2, 3, 4].map((i) => <EpisodeShimmer key={i} thumbWidth={episodeThumbWidth} />)}
              </View>
            )}
          </View>
        )}
      </View>
    </>
  );

  // --- LIST FOOTER COMPONENT (Everything below episodes) ---
  const renderFooter = () => (
    <View style={styles.listBody}>
      {loadingDetails ? (
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>More like this</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {[1, 2, 3, 4].map((i) => <CardShimmer key={i} width={similarCardWidth} height={similarCardWidth * 1.5} />)}
          </ScrollView>
        </View>
      ) : similarMovies.length > 0 && (
        <View style={[styles.section, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>More like this</Text>
          <FlatList
            horizontal
            data={similarMovies}
            showsHorizontalScrollIndicator={false}
            keyExtractor={keyExtractorId}
            contentContainerStyle={{ gap: 12 }}
            renderItem={renderSimilarMovieItem}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={3}
            removeClippedSubviews={true}
            getItemLayout={getSimilarItemLayout}
          />
        </View>
      )}
    </View>
  );

  // --- EPISODE RENDER ITEM ---
  const renderEpisodeItem = useCallback(({ item, index }: any) => {
    const isActive = lastWatched?.lastSeason === item.season_number && lastWatched?.lastEpisode === item.episode_number;
    return (
      <View style={styles.listBody}>
        <MemoizedEpisodeRow 
          ep={item} 
          index={index} 
          isActive={isActive} 
          episodeThumbWidth={episodeThumbWidth} 
          onPlay={handlePlay} 
        />
      </View>
    );
  }, [lastWatched, episodeThumbWidth, handlePlay]);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.glassBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowLogModal(true)} style={styles.glassBtn} activeOpacity={0.7}>
          <Feather name="info" size={20} color={C.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={movie.media_type === 'tv' && !loadingEpisodes ? episodes : []}
        keyExtractor={keyExtractorId}
        renderItem={renderEpisodeItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: C.surface,
    height: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: '700'
  },
  logContainer: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 8,
    padding: 12
  },
  logText: {
    color: C.text,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 6
  },

  heroEyebrow: {
    color: C.mutedSoft,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  heroTitle: {
    color: C.white,
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.8,
  },

  cardTop: {
    marginTop: -40,
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  listBody: {
    backgroundColor: C.bg,
    paddingHorizontal: 20,
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: C.white,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  copyBtn: { padding: 6, marginTop: 4 },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 14 },
  metaText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '500' },
  metaDot: { color: C.muted, fontSize: 12, marginHorizontal: 4 },
  certPill: {
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  certText: { color: C.mutedSoft, fontSize: 10, fontWeight: '700' },

  genreRow: { marginBottom: 18 },
  genreChip: {
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: C.surface,
  },
  genreChipText: { color: C.text, fontSize: 12, fontWeight: '500' },

  playBtn: {
    backgroundColor: C.white,
    borderRadius: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  downloadBtn: {
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 16,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  downloadBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  playBtnDisabled: { backgroundColor: C.surface2, opacity: 0.5 },
  playBtnText: { color: '#000', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  actionBtnActive: {
    borderColor: 'rgba(48,209,88,0.35)',
    backgroundColor: 'rgba(48,209,88,0.08)',
  },
  actionBtnText: { color: C.mutedSoft, fontSize: 11, fontWeight: '600' },

  section: { marginBottom: 32 },
  sectionTitle: {
    fontSize: 15,
    color: C.white,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  overviewText: { color: C.text, fontSize: 14.5, lineHeight: 23 },
  readMore: { color: C.white, fontWeight: '700', marginTop: 8, fontSize: 13 },

  aiPanel: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.aiBorder,
    borderRadius: 20,
    padding: 16,
    marginBottom: 32,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  aiHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiHeaderTitle: { color: C.white, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  aiTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 100,
    padding: 3,
  },
  aiTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  aiTabActive: { backgroundColor: C.aiSoft, borderWidth: 1, borderColor: C.aiBorder },
  aiTabText: { color: C.muted, fontSize: 11.5, fontWeight: '700' },
  aiTabTextActive: { color: C.ai },

  aiVerdictPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.aiSoft,
    borderWidth: 1,
    borderColor: C.aiBorder,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    marginBottom: 12,
  },
  aiVerdictDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ai },
  aiVerdictText: { color: C.ai, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.3 },
  aiFriendVerdict: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 23,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  aiField: { marginBottom: 12 },
  aiFieldLabel: {
    color: C.muted,
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  aiFieldValue: { color: C.text, fontSize: 13.5, lineHeight: 20 },
  aiSpoiler: {
    marginTop: 6,
    padding: 12,
    backgroundColor: 'rgba(255,69,58,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.25)',
  },
  aiSpoilerLabel: { color: C.red, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  aiErrorText: { color: C.mutedSoft, fontSize: 13, marginBottom: 8 },
  aiRetry: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  aiRetryText: { color: C.ai, fontSize: 13, fontWeight: '600' },
  aiGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.aiBorder,
  },
  aiGenerateText: { color: C.ai, fontSize: 13, fontWeight: '700' },

  directorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 100,
    paddingRight: 16,
    paddingLeft: 4,
    paddingVertical: 4,
  },
  directorImg: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface2 },
  directorName: { color: C.white, fontSize: 13, fontWeight: '700' },
  directorRole: { color: C.muted, fontSize: 11, fontWeight: '500' },

  castImg: { borderRadius: 12, backgroundColor: C.surface2, marginBottom: 8 },
  castName: { color: C.white, fontSize: 12.5, fontWeight: '600', textAlign: 'left' },
  castCharacter: { color: C.muted, fontSize: 11, fontWeight: '400', marginTop: 2, textAlign: 'left' },

  seasonPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  seasonPillActive: { backgroundColor: C.white, borderColor: C.white },
  seasonPillText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '600' },
  seasonPillTextActive: { color: '#000', fontWeight: '700' },

  epRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 10,
    padding: 8,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  epRowActive: { borderColor: 'rgba(255,214,10,0.4)', backgroundColor: 'rgba(255,214,10,0.05)' },
  epThumb: { borderRadius: 10, backgroundColor: C.surface2 },
  epPlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
  },
  epActiveDot: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
  },
  epNum: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  epTitle: { color: C.white, fontSize: 13.5, fontWeight: '700', marginBottom: 3 },
  epOverview: { color: C.mutedSoft, fontSize: 11.5, lineHeight: 16 },
  
  similarCard: { marginRight: 12 },
  similarImg: { borderRadius: 12, backgroundColor: C.surface2 },
  similarTitle: { color: C.white, fontSize: 12, fontWeight: '600', marginTop: 8, lineHeight: 16 },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: { color: C.white, fontSize: 10, fontWeight: '700' },
});

export default DetailPage;