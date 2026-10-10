import React, { useEffect, useState, useCallback, useRef } from 'react';
import dayjs from 'dayjs';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  ToastAndroid,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  Linking,
  BackHandler,
  FlatList,
  DimensionValue,
} from 'react-native';
import { Image } from 'expo-image';
import { Text } from 'react-native-paper';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  getImageUrl,
  getSimilarMedia,
  getFullDetails,
  getMediaDetails,
  getMediaImages,
  getSeasonEpisodes,
  TMDBEpisode,
  getGeminiMoviesSimilarTo,
  GLOBAL_CONFIG,
  getCollectionDetails,
} from '../../src/tmdb';
import { getProgress } from '../../src/utils/progress';
import {
  getSavedItems,
  addSavedItem,
  removeSavedItem,
  hasSavedItem,
  subscribeToSavedItemsChanges,
} from '../../src/database';
import { logTasteEvent, TASTE_WEIGHTS } from '../../src/services/tasteProfile';
import { ShimmerBlock } from '../../src/components/shared/Shimmer';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getGenreIcon } from '../../src/components/explore/ExploreConstants';
import MovieChatSection from '../../src/components/movie/MovieChatSection';
import { MovieDetailSkeleton } from '../../src/components/movie/MovieDetailSkeleton';
import MovieMediaGallery from '../../src/components/movie/MovieMediaGallery';
import MovieTorrentModal from '../../src/components/movie/MovieTorrentModal';

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;
const INITIAL_EPISODES_LIMIT = 8;

const runWhenIdle = (cb: () => void) => {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(cb, { timeout: 400 });
    return () => cancelIdleCallback(handle);
  }
  const timer = setTimeout(cb, 180);
  return () => clearTimeout(timer);
};

const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  red: '#FF453A',
  gold: '#FFD60A',
  green: '#30D158',
  ai: '#FF453A',
  aiSoft: 'rgba(255,69,58,0.10)',
};

const ListSpacer = () => <View style={{ width: 12 }} />;

const AIShimmerBar = ({ width: w = '100%', height = 12 }: { width?: string | number; height?: number }) => (
  <View style={{ width: w as any, height, borderRadius: 6, backgroundColor: C.aiSoft, marginBottom: 8 }} />
);

const EpisodeShimmer = React.memo(({ thumbWidth }: { thumbWidth: number }) => (
  <View style={styles.epRow}>
    <ShimmerBlock width={thumbWidth} height={thumbWidth * 0.56} borderRadius={10} />
    <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
      <ShimmerBlock width="35%" height={10} />
      <ShimmerBlock width="85%" height={14} />
      <ShimmerBlock width="100%" height={12} />
    </View>
  </View>
));

const CardShimmer = React.memo(({ width, height }: { width: DimensionValue; height: DimensionValue }) => (
  <View style={{ width, marginRight: 12 }}>
    <ShimmerBlock width={width} height={height} borderRadius={12} />
    <View style={{ marginTop: 8, gap: 6 }}>
      <ShimmerBlock width="80%" height={12} />
      <ShimmerBlock width="50%" height={10} />
    </View>
  </View>
));

const MemoizedSimilarCard = React.memo(({ item, cardWidth, onPress }: any) => (
  <TouchableOpacity
    activeOpacity={0.92}
    style={[styles.similarCard, { width: cardWidth }]}
    onPress={() => onPress(item)}
  >
    <Image
      source={{ uri: getImageUrl(item.poster_path, 'w342') }}
      style={[styles.similarImg, { width: cardWidth, height: cardWidth * 1.5 }]}
      contentFit="cover"
      cachePolicy="disk"
    />
    <View style={styles.ratingBadge}>
      <Ionicons name="star" size={9} color={C.gold} />
      <Text style={styles.ratingText}>{item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</Text>
    </View>
    <Text style={styles.similarTitle} numberOfLines={2}>
      {item.title || item.name}
    </Text>
  </TouchableOpacity>
));

const MemoizedDirectorCard = React.memo(({ item, mediaType, onPress }: any) => (
  <TouchableOpacity
    activeOpacity={0.92}
    style={styles.directorCard}
    onPress={() => onPress(item.id)}
  >
    <Image
      source={{
        uri: item.profile_path
          ? getImageUrl(item.profile_path, 'w185')
          : 'https://via.placeholder.com/150',
      }}
      style={styles.directorImg}
      contentFit="cover"
      cachePolicy="disk"
    />
    <View style={{ maxWidth: 140 }}>
      <Text style={styles.directorName} numberOfLines={1}>
        {item.name}
      </Text>
      <Text style={styles.directorRole} numberOfLines={1}>
        {item.role || (mediaType === 'tv' ? 'Creator' : 'Director')}
      </Text>
    </View>
  </TouchableOpacity>
));

const MemoizedCastCard = React.memo(({ item, cardWidth, onPress }: any) => (
  <TouchableOpacity
    activeOpacity={0.92}
    style={{ width: cardWidth }}
    onPress={() => onPress(item.id)}
  >
    <Image
      source={{
        uri: item.profile_path
          ? getImageUrl(item.profile_path, 'w185')
          : 'https://via.placeholder.com/150',
      }}
      style={[styles.castImg, { width: cardWidth, height: cardWidth * 1.35 }]}
      contentFit="cover"
      cachePolicy="disk"
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
));

const MemoizedEpisodeRow = React.memo(({ ep, isActive, episodeThumbWidth, onPlay }: any) => (
  <TouchableOpacity
    activeOpacity={0.92}
    style={[styles.epRow, isActive && styles.epRowActive]}
    onPress={() => onPlay(ep)}
  >
    <View style={{ position: 'relative' }}>
      <Image
        source={{
          uri: ep.still_path
            ? getImageUrl(ep.still_path, 'w185')
            : 'https://via.placeholder.com/150',
        }}
        style={[styles.epThumb, { width: episodeThumbWidth, height: episodeThumbWidth * 0.56 }]}
        contentFit="cover"
        cachePolicy="disk"
      />
      <View style={styles.epPlayOverlay}>
        <Ionicons name="play" size={16} color="#FFF" />
      </View>
      {isActive ? <View style={styles.epActiveDot} /> : null}
    </View>
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.epNum, isActive && { color: C.gold }]}>
          EPISODE {ep.episode_number}
        </Text>
        {ep.air_date ? (
          <Text style={{ fontSize: 11, color: C.muted }}>
            {dayjs(ep.air_date).format('MMM D, YYYY')}
          </Text>
        ) : null}
      </View>
      <Text style={styles.epTitle} numberOfLines={1}>
        {ep.name}
      </Text>
      <Text style={styles.epOverview} numberOfLines={2}>
        {ep.overview}
      </Text>
    </View>
  </TouchableOpacity>
));

export default function DetailPage() {
  const router = useRouter();
  const { id, media_type } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const HEADER_HEIGHT = isLandscape ? height * 0.55 : height * 0.50;

  const [movie, setMovie] = useState<any>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isReadyToRenderExtras, setIsReadyToRenderExtras] = useState(false);

  const [genres, setGenres] = useState<{ id: number; name: string }[]>([]);
  const [directors, setDirectors] = useState<any[]>([]);
  const [collectionData, setCollectionData] = useState<any>(null);
  const [similarMovies, setSimilarMovies] = useState<any[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);

  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [showFullOverview, setShowFullOverview] = useState(false);
  const [lastWatched, setLastWatched] = useState<any>(null);
  const [sourceStatus, setSourceStatus] = useState<'checking' | 'available' | 'unavailable'>('checking');
  const [torrentModalVisible, setTorrentModalVisible] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [episodesLimit, setEpisodesLimit] = useState(INITIAL_EPISODES_LIMIT);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const episodeRequestRef = useRef(0);

  const [aiTab, setAiTab] = useState<'lens' | 'chat' | 'vibe'>('lens');
  const [lensInsight, setLensInsight] = useState<any>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);

  const similarCardWidth = isTablet ? 160 : width * 0.3;
  const castCardWidth = isTablet ? 120 : width * 0.26;
  const episodeThumbWidth = isTablet ? 200 : width * 0.34;

  useEffect(() => {
    const onBack = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [router]);

  // Phase 1: Fast initial metadata
  useEffect(() => {
    if (!id) return;
    let isActive = true;

    const fetchInitial = async () => {
      try {
        setDetailsError(null);
        const data = await getMediaDetails(Number(id), (media_type as 'movie' | 'tv') || 'movie');

        if (!isActive) return;
        setMovie(data);
        setGenres(data.genres || []);

        if (data.media_type === 'tv' && data.seasons && data.seasons.length > 0) {
          const firstValidSeason = data.seasons.find((s: any) => s.season_number > 0);
          if (firstValidSeason) {
            setSelectedSeason(firstValidSeason.season_number);
          }
        }
      } catch {
        if (isActive) {
          setDetailsError('Unable to load this title. Check your connection.');
        }
      }
    };

    fetchInitial();
    return () => {
      isActive = false;
    };
  }, [id, media_type]);

  // Phase 2: Deferred crew, cast, collection, and recommendations
  useEffect(() => {
    if (!movie?.id) return;

    const cancelIdle = runWhenIdle(() => {
      setIsReadyToRenderExtras(true);

      getFullDetails({ id: movie.id, media_type: movie.media_type } as any)
        .then((fullData: any) => {
          const merged: any[] = [];
          if (fullData.director) {
            merged.push({
              ...fullData.director,
              role: fullData.director.job || (movie.media_type === 'tv' ? 'Creator' : 'Director'),
            });
          }
          const crew = fullData.crew || fullData.credits?.crew || [];
          const creators = fullData.created_by || [];
          const dirFromCrew = crew.filter(
            (p: any) => p.job === 'Director' || p.department === 'Directing'
          );
          [...creators, ...dirFromCrew].forEach((person: any) => {
            if (!person?.id || merged.find((entry) => entry.id === person.id)) return;
            merged.push({
              ...person,
              role: person.job || (movie.media_type === 'tv' ? 'Creator' : 'Director'),
            });
          });
          setDirectors(merged);

          setMovie((prev: any) => ({
            ...prev,
            ...(fullData.cast ? { cast: fullData.cast } : {}),
            images: fullData.images || prev?.images || [],
            posters: fullData.posters || prev?.posters || [],
          }));

          if ((!fullData.images || fullData.images.length === 0) && (!fullData.posters || fullData.posters.length === 0)) {
            getMediaImages(movie.id, movie.media_type)
              .then((imgs) => {
                setMovie((prev: any) => ({
                  ...prev,
                  images: imgs.backdrops,
                  posters: imgs.posters,
                }));
              })
              .catch(() => {});
          }
        })
        .catch(() => {});

      if (movie.belongs_to_collection) {
        getCollectionDetails(movie.belongs_to_collection.id)
          .then((col) => setCollectionData(col))
          .catch(() => {});
      }

      loadSimilar();
    });

    return () => cancelIdle();
  }, [movie?.id]);

  const prefetchSources = useCallback(async (seasonToTry = 1, episodeToTry = 1) => {
    if (!movie) return;
    setSourceStatus('checking');
    try {
      const baseUrl = 'https://watcher-api-rho.vercel.app';
      const encodedTitle = encodeURIComponent(movie.title || movie.name || '');
      const endpoint = `${baseUrl}/api/get_stream?tmdb_id=${movie.id}&media_type=${movie.media_type}&title=${encodedTitle}&season=${seasonToTry}&episode=${episodeToTry}`;
      const response = await fetch(endpoint);
      const data = await response.json();
      setSourceStatus(data.status === 'success' && data.stream_url ? 'available' : 'unavailable');
    } catch {
      setSourceStatus('unavailable');
    }
  }, [movie]);

  useEffect(() => {
    if (movie?.id) {
      let s = 1;
      let e = 1;
      if (movie.media_type === 'tv') {
        s = lastWatched?.lastSeason || 1;
        e = lastWatched?.lastEpisode || 1;
      }
      prefetchSources(s, e);
    }
  }, [movie?.id, lastWatched, prefetchSources]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      if (movie?.id) {
        getProgress(movie.id).then((progress) => {
          if (isActive) setLastWatched(progress);
        });
        setIsInWatchlist(hasSavedItem(movie.id, 'watchlist'));
        setIsWatched(hasSavedItem(movie.id, 'history'));
      }
      return () => {
        isActive = false;
      };
    }, [movie?.id])
  );

  useEffect(
    () =>
      subscribeToSavedItemsChanges((type) => {
        if (!movie?.id) return;
        if (type === 'watchlist') setIsInWatchlist(hasSavedItem(movie.id, 'watchlist'));
        if (type === 'history') setIsWatched(hasSavedItem(movie.id, 'history'));
      }),
    [movie?.id]
  );

  const fetchEpisodes = async (seasonNumber: number) => {
    if (!movie?.id) return;
    const reqId = ++episodeRequestRef.current;
    setLoadingEpisodes(true);
    setEpisodesLimit(INITIAL_EPISODES_LIMIT);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber);
      if (reqId === episodeRequestRef.current) {
        setEpisodes(data);
      }
    } catch {
      if (reqId === episodeRequestRef.current) setEpisodes([]);
    } finally {
      if (reqId === episodeRequestRef.current) setLoadingEpisodes(false);
    }
  };

  useEffect(() => {
    if (selectedSeason !== null && movie?.media_type === 'tv') {
      fetchEpisodes(selectedSeason);
    }
  }, [selectedSeason]);

  const loadSimilar = async () => {
    if (!movie?.id) return;
    setLoadingSimilar(true);
    try {
      const results = await getSimilarMedia(movie.id, movie.media_type);
      setSimilarMovies(results);
    } catch {
      setSimilarMovies([]);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const fetchAiRecommendations = async () => {
    if (!movie || (!movie.title && !movie.name)) return;
    setLoadingAi(true);
    const aiData = await getGeminiMoviesSimilarTo(movie.title || movie.name, movie.media_type, movie.id);
    setAiRecommendations(aiData);
    setLoadingAi(false);
  };

  const fetchLensInsight = async () => {
    if (!movie || (!movie.title && !movie.name)) return;
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

  const handlePlay = useCallback((episode?: TMDBEpisode) => {
    if (sourceStatus === 'unavailable') {
      Alert.alert('Unavailable', 'No streaming source found for this title.');
      return;
    }
    let targetSeason = 1;
    let targetEpisode = 1;
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

    let nextSeason: number | undefined;
    let nextEpisode: number | undefined;
    if (movie.media_type === 'tv') {
      const seasonEpisodes = episodes
        .filter((item) => item.season_number === targetSeason)
        .sort((a, b) => a.episode_number - b.episode_number);
      const currentIndex = seasonEpisodes.findIndex((item) => item.episode_number === targetEpisode);
      const following = seasonEpisodes[currentIndex + 1];
      if (following) {
        nextSeason = following.season_number;
        nextEpisode = following.episode_number;
      }
    }

    const nextParams = nextSeason && nextEpisode ? `&nextSeason=${nextSeason}&nextEpisode=${nextEpisode}` : '';
    router.push(
      `/player?id=${movie.id}&media_type=${movie.media_type}&title=${encodeURIComponent(
        movie.title || movie.name
      )}&season=${targetSeason}&episode=${targetEpisode}&poster=${encodeURIComponent(
        movie.poster_path || ''
      )}&episodeName=${encodeURIComponent(episode ? episode.name : `Episode ${targetEpisode}`)}${nextParams}`
    );
  }, [sourceStatus, movie, lastWatched, episodes, router]);

  const toggleWatchlist = () => {
    if (!movie) return;
    const exists = hasSavedItem(movie.id, 'watchlist');
    if (exists) {
      removeSavedItem(movie.id, 'watchlist');
    } else {
      addSavedItem(movie, 'watchlist');
      logTasteEvent({
        entity_type: movie.media_type === 'tv' ? 'tv' : 'movie',
        entity_id: movie.id,
        entity_name: movie.title || movie.name,
        genres: movie.genres,
        weight: TASTE_WEIGHTS.WATCHLIST_ADD,
      });
    }
    setIsInWatchlist(!exists);
    if (Platform.OS === 'android') {
      ToastAndroid.show(exists ? 'Removed from Watchlist' : 'Added to Watchlist', ToastAndroid.SHORT);
    }
  };

  // Auto-untoggle Watchlist when Marked as Watched
  const toggleWatched = async () => {
    if (!movie) return;
    const exists = hasSavedItem(movie.id, 'history');
    if (exists) {
      removeSavedItem(movie.id, 'history');
      setIsWatched(false);
    } else {
      addSavedItem(movie, 'history');
      logTasteEvent({
        entity_type: movie.media_type === 'tv' ? 'tv' : 'movie',
        entity_id: movie.id,
        entity_name: movie.title || movie.name,
        genres: movie.genres,
        weight: TASTE_WEIGHTS.COMPLETED_WATCH,
      });
      setIsWatched(true);

      // Automatically un-toggle Watchlist
      if (hasSavedItem(movie.id, 'watchlist')) {
        removeSavedItem(movie.id, 'watchlist');
        setIsInWatchlist(false);
      }
    }

    if (!exists && movie.belongs_to_collection) {
      const watchlistArr = getSavedItems('watchlist');
      const colInWatchlist = watchlistArr.find(
        (i: any) => i.id === movie.belongs_to_collection.id && i.media_type === 'collection'
      );
      if (colInWatchlist) {
        const colDetails = await getCollectionDetails(movie.belongs_to_collection.id);
        if (colDetails?.parts && colDetails.parts.length > 0) {
          const historyArr = getSavedItems('history');
          const allWatched = colDetails.parts.every((part: any) =>
            historyArr.some((hi: any) => hi.id === part.id)
          );
          if (allWatched) {
            removeSavedItem(colDetails.id, 'watchlist');
            if (!hasSavedItem(colDetails.id, 'history')) addSavedItem(colDetails, 'history');
            if (Platform.OS === 'android') {
              ToastAndroid.show(`${colDetails.name} completed!`, ToastAndroid.SHORT);
            }
          }
        }
      }
    }
  };

  const openTelegramSearch = () => {
    if (!movie) return;
    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date)?.substring(0, 4) || '';
    const message = encodeURIComponent(`${title} ${year}`);
    Linking.openURL(`tg://msg?text=${message}`).catch(() =>
      Linking.openURL(`https://t.me/share/url?text=${message}`)
    );
  };

  const openTorrentSearch = () => {
    if (!movie) return;
    setTorrentModalVisible(true);
  };

  const copyTitle = async () => {
    if (!movie) return;
    const text = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.substring(0, 4) || ''}`;
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'android') ToastAndroid.show('Copied!', ToastAndroid.SHORT);
  };

  const renderCastItem = useCallback(
    ({ item }: any) => (
      <MemoizedCastCard
        item={item}
        cardWidth={castCardWidth}
        onPress={(personId: number) => router.push(`/cast/${personId}`)}
      />
    ),
    [castCardWidth, router]
  );

  const renderDirectorItem = useCallback(
    ({ item }: any) => (
      <MemoizedDirectorCard
        item={item}
        mediaType={movie?.media_type}
        onPress={(personId: number) => router.push(`/cast/${personId}`)}
      />
    ),
    [movie?.media_type, router]
  );

  const renderSimilarItem = useCallback(
    ({ item }: any) => (
      <MemoizedSimilarCard
        item={item}
        cardWidth={similarCardWidth}
        onPress={(clicked: any) =>
          router.push(`/movie/${clicked.id}?media_type=${clicked.media_type || 'movie'}`)
        }
      />
    ),
    [similarCardWidth, router]
  );

  const displayTitle = movie?.title || movie?.name;
  const rawDate = movie?.release_date || movie?.first_air_date;
  const releaseYear = rawDate ? dayjs(rawDate).format('MMM YYYY') : '';

  if (!movie) {
    if (!detailsError) return <MovieDetailSkeleton />;
    return (
      <View style={[styles.root, styles.detailsLoading]}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <ActivityIndicator color={C.white} size="large" />
        <Text style={styles.detailsError}>{detailsError}</Text>
      </View>
    );
  }

  const visibleEpisodes = episodes.slice(0, episodesLimit);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Lightweight Static Hero Backdrop */}
      <View style={[styles.heroContainer, { height: HEADER_HEIGHT }]} pointerEvents="none">
        <Image
          source={{ uri: getImageUrl(movie.poster_path, 'w500') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          priority="high"
        />
        <LinearGradient
          colors={['rgba(10,10,11,0.1)', 'transparent', C.bg]}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Top Bar HUD */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)');
          }}
          style={styles.glassBtn}
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </View>

      {/* Main Single Scroll Container */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Lowered Details Card Spacer */}
        <View style={{ height: HEADER_HEIGHT + 30 }} />

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
            <TouchableOpacity activeOpacity={0.8} onPress={copyTitle} style={styles.copyBtn}>
              <Feather name="copy" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Core Metadata */}
          <View style={styles.metaRow}>
            {movie.runtime && movie.runtime > 0 ? (
              <Text style={styles.metaText}>
                {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
              </Text>
            ) : null}
            {movie.vote_average && movie.vote_average > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {movie.runtime && movie.runtime > 0 ? <Text style={styles.metaDot}>·</Text> : null}
                <Ionicons name="star" size={11} color={C.gold} />
                <Text style={[styles.metaText, { marginLeft: 4 }]}>
                  {movie.vote_average.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {movie.certification ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.metaDot}>·</Text>
                <View style={styles.certPill}>
                  <Text style={styles.certText}>{movie.certification}</Text>
                </View>
              </View>
            ) : null}
            {movie.media_type === 'tv' && movie.number_of_seasons ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>{movie.number_of_seasons} Seasons</Text>
              </View>
            ) : null}
          </View>

          {/* Genres */}
          {genres && genres.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.genreRow}
              contentContainerStyle={{ gap: 8 }}
            >
              {genres.map((g) => {
                const iconName = getGenreIcon(g.id, g.name);
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    key={g.id}
                    style={styles.genreCard}
                    onPress={() =>
                      router.push(
                        `/viewall?title=${encodeURIComponent(g.name)}&type=${encodeURIComponent(
                          `genre/${g.id}`
                        )}`
                      )
                    }
                  >
                    <Ionicons name={iconName} size={13} color={C.red} style={styles.genreCardIcon} />
                    <Text style={styles.genreCardText}>{g.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Primary Play CTA */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryCtaBtn, sourceStatus === 'unavailable' && styles.primaryCtaDisabled]}
            onPress={() => handlePlay()}
            disabled={sourceStatus !== 'available'}
          >
            <Ionicons name={lastWatched ? 'play-skip-forward' : 'play'} size={20} color="#000" />
            <Text style={styles.primaryCtaText}>
              {sourceStatus === 'checking'
                ? 'Finding stream'
                : sourceStatus === 'unavailable'
                ? 'Unavailable'
                : lastWatched
                ? movie.media_type === 'tv'
                  ? `Resume S${lastWatched.lastSeason} · E${lastWatched.lastEpisode}`
                  : 'Resume'
                : 'Play'}
            </Text>
          </TouchableOpacity>

          {/* Primary Download CTA (Stacked Directly Below Play in Same Style) */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.primaryCtaBtn, styles.downloadCtaBtn]}
            onPress={openTorrentSearch}
          >
            <Feather name="download" size={19} color="#000" />
            <Text style={styles.primaryCtaText}>Download</Text>
          </TouchableOpacity>

          {/* Action Dock: Watchlist, Watched, Telegram */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.actionBtn, isInWatchlist && styles.actionBtnWatchlistActive]}
              onPress={toggleWatchlist}
            >
              <Ionicons
                name={isInWatchlist ? 'bookmark' : 'bookmark-outline'}
                size={18}
                color={isInWatchlist ? C.red : C.white}
              />
              <Text style={[styles.actionBtnText, isInWatchlist && { color: C.red, fontWeight: '700' }]}>
                Watchlist
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={[styles.actionBtn, isWatched && styles.actionBtnActive]}
              onPress={toggleWatched}
            >
              <Ionicons
                name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={18}
                color={isWatched ? C.green : C.mutedSoft}
              />
              <Text style={[styles.actionBtnText, isWatched && { color: C.green }]}>Watched</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.actionBtn}
              onPress={openTelegramSearch}
            >
              <Ionicons name="paper-plane-outline" size={17} color={C.mutedSoft} />
              <Text style={styles.actionBtnText}>Telegram</Text>
            </TouchableOpacity>
          </View>

          {/* Overview */}
          {movie.overview ? (
            <View style={styles.section}>
              <Text style={styles.overviewText}>
                {showFullOverview || movie.overview.length <= 220
                  ? movie.overview
                  : `${movie.overview.slice(0, 220)}…`}
              </Text>
              {movie.overview.length > 220 ? (
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowFullOverview(!showFullOverview)}>
                  <Text style={styles.readMore}>{showFullOverview ? 'Less' : 'Read more'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Collection Banner */}
          {isReadyToRenderExtras && movie.belongs_to_collection ? (
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.collectionBanner}
              onPress={() =>
                router.push(
                  `/collection/${movie.belongs_to_collection.id}?name=${encodeURIComponent(
                    movie.belongs_to_collection.name
                  )}`
                )
              }
            >
              <Image
                source={{ uri: getImageUrl(movie.belongs_to_collection.backdrop_path, 'w500') }}
                style={styles.collectionBackdrop}
                contentFit="cover"
                cachePolicy="disk"
              />
              <LinearGradient
                colors={['transparent', 'rgba(10,10,11,0.5)', '#0A0A0A']}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.collectionContent}>
                <Text style={styles.collectionSubtitle}>
                  Part of a Collection {collectionData?.parts?.length ? `• ${collectionData.parts.length} Movies` : ''}
                </Text>
                <Text style={styles.collectionName} numberOfLines={2}>
                  {movie.belongs_to_collection.name}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {/* AI Insights */}
          {isReadyToRenderExtras ? (
            <View style={styles.aiPanel}>
              <View style={styles.aiHeader}>
                <View style={styles.aiHeaderLeft}>
                  <MaterialCommunityIcons name="creation" size={18} color={C.ai} />
                  <Text style={styles.aiHeaderTitle}>AI Insights</Text>
                </View>
                <View style={styles.aiTabs}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.aiTab, aiTab === 'lens' && styles.aiTabActive]}
                    onPress={() => {
                      setAiTab('lens');
                      if (!lensInsight && !lensLoading) fetchLensInsight();
                    }}
                  >
                    <Text style={[styles.aiTabText, aiTab === 'lens' && styles.aiTabTextActive]}>Lens</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.aiTab, aiTab === 'chat' && styles.aiTabActive]}
                    onPress={() => setAiTab('chat')}
                  >
                    <Text style={[styles.aiTabText, aiTab === 'chat' && styles.aiTabTextActive]}>Chat</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.aiTab, aiTab === 'vibe' && styles.aiTabActive]}
                    onPress={() => setAiTab('vibe')}
                  >
                    <Text style={[styles.aiTabText, aiTab === 'vibe' && styles.aiTabTextActive]}>Vibe</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {aiTab === 'lens' ? (
                <View>
                  {lensLoading ? (
                    <View style={{ paddingTop: 6 }}>
                      <AIShimmerBar width="40%" height={14} />
                      <AIShimmerBar width="100%" />
                      <AIShimmerBar width="88%" />
                    </View>
                  ) : lensError ? (
                    <View>
                      <Text style={styles.aiErrorText}>Couldn't load insight.</Text>
                      <TouchableOpacity activeOpacity={0.8} onPress={fetchLensInsight} style={styles.aiRetry}>
                        <Feather name="rotate-cw" size={13} color={C.ai} />
                        <Text style={styles.aiRetryText}>Try again</Text>
                      </TouchableOpacity>
                    </View>
                  ) : lensInsight ? (
                    <View>
                      <View style={styles.aiVerdictPill}>
                        {/* <View style={styles.aiVerdictDot} /> */}
                        <Text style={styles.aiVerdictText}>{lensInsight.worthIt}</Text>
                      </View>
                      <Text style={styles.aiFriendVerdict}>"{lensInsight.friendVerdict}"</Text>
                      {lensInsight.vibe ? (
                        <View style={styles.aiField}>
                          <Text style={styles.aiFieldLabel}>Vibe</Text>
                          <Text style={styles.aiFieldValue}>{lensInsight.vibe}</Text>
                        </View>
                      ) : null}
                      {lensInsight.whatItsActuallyAbout ? (
                        <View style={styles.aiField}>
                          <Text style={styles.aiFieldLabel}>Story & Premise</Text>
                          <Text style={styles.aiFieldValue}>{lensInsight.whatItsActuallyAbout}</Text>
                        </View>
                      ) : null}
                      {(lensInsight.certificationWarning || lensInsight.whatYoullSee) ? (
                          <View style={styles.aiAdvisory}>
                            <Text style={styles.aiAdvisoryLabel}>⚠ Content Advisory</Text>
                            <Text style={styles.aiAdvisoryFieldValue}>{lensInsight.certificationWarning || lensInsight.whatYoullSee}</Text>
                          </View>
                        ) : null}
                    </View>
                  ) : (
                    <TouchableOpacity activeOpacity={0.8} onPress={fetchLensInsight} style={styles.aiGenerateBtn}>
                      <MaterialCommunityIcons name="creation" size={16} color={C.ai} />
                      <Text style={styles.aiGenerateText}>Generate Lens insight</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : aiTab === 'chat' ? (
                <MovieChatSection
                  movie={movie}
                  releaseYear={releaseYear}
                  directors={directors}
                  genres={genres}
                />
              ) : (
                <View>
                  {loadingAi ? (
                    <View style={{ flexDirection: 'row', gap: 10, paddingTop: 6 }}>
                      {[1, 2, 3].map((i) => (
                        <View key={i} style={{ flex: 1 }}>
                          <CardShimmer width="100%" height={similarCardWidth * 1.5} />
                        </View>
                      ))}
                    </View>
                  ) : aiRecommendations && aiRecommendations.length > 0 ? (
                    <FlatList
                      horizontal
                      data={aiRecommendations}
                      showsHorizontalScrollIndicator={false}
                      keyExtractor={(item) => String(item.id)}
                      renderItem={renderSimilarItem}
                      ItemSeparatorComponent={ListSpacer}
                    />
                  ) : (
                    <TouchableOpacity activeOpacity={0.8} onPress={fetchAiRecommendations} style={styles.aiGenerateBtn}>
                      <MaterialCommunityIcons name="creation" size={16} color={C.ai} />
                      <Text style={styles.aiGenerateText}>Find similar vibes</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ) : null}

          {/* Directors with In-Page Skeleton Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {movie.media_type === 'tv' ? 'Created by' : 'Directed by'}
            </Text>
            {!isReadyToRenderExtras ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={[styles.directorCard, { paddingRight: 16 }]}>
                    <ShimmerBlock width={38} height={38} borderRadius={19} />
                    <View style={{ gap: 4 }}>
                      <ShimmerBlock width={60} height={12} />
                      <ShimmerBlock width={40} height={10} />
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : directors && directors.length > 0 ? (
              <FlatList
                horizontal
                data={directors}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderDirectorItem}
              />
            ) : null}
          </View>

          {/* Cast with In-Page Skeleton Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cast</Text>
            {!isReadyToRenderExtras || !movie.cast ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {[1, 2, 3, 4].map((i) => (
                  <CardShimmer key={i} width={castCardWidth} height={castCardWidth * 1.35} />
                ))}
              </ScrollView>
            ) : (
              <FlatList
                horizontal
                data={movie.cast.slice(0, 15)}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderCastItem}
                ItemSeparatorComponent={ListSpacer}
              />
            )}
          </View>

          {/* TV Episodes with In-Page Skeleton Placeholder */}
          {movie.media_type === 'tv' && movie.seasons && movie.seasons.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Episodes</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
              >
                {movie.seasons
                  .filter((s: any) => s.season_number > 0)
                  .map((s: any) => (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      key={s.id}
                      style={[
                        styles.seasonPill,
                        selectedSeason === s.season_number && styles.seasonPillActive,
                      ]}
                      onPress={() => setSelectedSeason(s.season_number)}
                    >
                      <Text
                        style={[
                          styles.seasonPillText,
                          selectedSeason === s.season_number && styles.seasonPillActiveText,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {loadingEpisodes ? (
                <View style={{ gap: 10 }}>
                  {[1, 2, 3].map((i) => (
                    <EpisodeShimmer key={i} thumbWidth={episodeThumbWidth} />
                  ))}
                </View>
              ) : (
                <View>
                  {visibleEpisodes.map((ep) => {
                    const isActive =
                      lastWatched?.lastSeason === ep.season_number &&
                      lastWatched?.lastEpisode === ep.episode_number;
                    return (
                      <MemoizedEpisodeRow
                        key={ep.id}
                        ep={ep}
                        isActive={isActive}
                        episodeThumbWidth={episodeThumbWidth}
                        onPlay={handlePlay}
                      />
                    );
                  })}

                  {episodes.length > episodesLimit ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.showMoreEpBtn}
                      onPress={() => setEpisodesLimit((prev) => prev + 15)}
                    >
                      <Text style={styles.showMoreEpText}>
                        Show more episodes ({episodes.length - episodesLimit} remaining)
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          {/* Photos & Scene Images Gallery */}
          {isReadyToRenderExtras ? (
            <MovieMediaGallery
              backdrops={movie.images}
              posters={movie.posters}
              fallbackBackdrop={movie.backdrop_path}
              fallbackPoster={movie.poster_path}
              title={displayTitle}
            />
          ) : null}

          {/* Similar Titles with In-Page Skeleton Placeholder */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>More like this</Text>
            {!isReadyToRenderExtras || loadingSimilar ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {[1, 2, 3, 4].map((i) => (
                  <CardShimmer key={i} width={similarCardWidth} height={similarCardWidth * 1.5} />
                ))}
              </ScrollView>
            ) : similarMovies && similarMovies.length > 0 ? (
              <FlatList
                horizontal
                data={similarMovies}
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderSimilarItem}
              />
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* In-Page Torrent Downloads Overlay */}
      <MovieTorrentModal
        visible={torrentModalVisible}
        onClose={() => setTorrentModalVisible(false)}
        title={movie?.title || movie?.name || ''}
        year={(movie?.release_date || movie?.first_air_date)?.slice(0, 4)}
        mediaType={movie?.media_type}
        tmdbId={movie?.id}
        genres={movie?.genres}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  heroContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  detailsLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  detailsError: {
    color: C.mutedSoft,
    fontSize: 15,
    marginHorizontal: 32,
    marginTop: 18,
    textAlign: 'center',
  },
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroEyebrow: {
    color: C.mutedSoft,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardTop: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  copyBtn: { padding: 6, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 14 },
  metaText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '500' },
  metaDot: { color: C.muted, fontSize: 12, marginHorizontal: 4 },
  certPill: {
    backgroundColor: C.surface2,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 4,
  },
  certText: { color: C.mutedSoft, fontSize: 10, fontWeight: '700' },
  genreRow: { marginBottom: 18 },
  genreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: '#24242A',
  },
  genreCardIcon: { marginRight: 6 },
  genreCardText: { color: C.text, fontSize: 12.5, fontWeight: '600' },
  genreChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: C.surface,
  },
  genreChipText: { color: C.text, fontSize: 12, fontWeight: '500' },

  // Primary Stacked CTAs
  primaryCtaBtn: {
    width: '100%',
    backgroundColor: C.white,
    borderRadius: 16,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  downloadCtaBtn: {
    backgroundColor: C.white,
    marginBottom: 16,
  },
  primaryCtaDisabled: {
    backgroundColor: C.surface2,
    opacity: 0.5,
  },
  primaryCtaText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  actionBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(48,209,88,0.12)',
  },
  actionBtnWatchlistActive: {
    backgroundColor: 'rgba(255,69,58,0.12)',
  },
  actionBtnText: { color: C.mutedSoft, fontSize: 11, fontWeight: '600' },
  collectionBanner: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
    height: 160,
    backgroundColor: '#0A0A0A',
    position: 'relative',
  },
  collectionBackdrop: {
    ...StyleSheet.absoluteFill,
    opacity: 0.8,
  },
  collectionContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  collectionSubtitle: {
    color: C.gold,
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  collectionName: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 16,
    color: C.white,
    fontWeight: '700',
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  overviewText: { color: C.text, fontSize: 14, lineHeight: 22 },
  readMore: { color: C.white, fontWeight: '700', marginTop: 8, fontSize: 13 },
  aiPanel: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 28,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  aiHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiHeaderTitle: { color: C.white, fontSize: 15, fontWeight: '700' },
  aiTabs: {
    flexDirection: 'row',
    backgroundColor: '#0c0c0c',
    borderRadius: 100,
    padding: 2,
  },
  aiTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  aiTabActive: { backgroundColor: C.aiSoft },
  aiTabText: { color: C.muted, fontSize: 11.5, fontWeight: '700' },
  aiTabTextActive: { color: C.ai },
  aiVerdictPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.aiSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    marginBottom: 12,
    paddingBlock:10
  },
  aiVerdictDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.ai },
  aiVerdictText: { color: C.ai, 
    fontSize: 11.5, 
    fontWeight: '700', 
    letterSpacing: 0.3,
    paddingStart: 15,
  },
  aiFriendVerdict: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    fontStyle: 'italic',
    marginBottom: 12,
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
  aiAdvisory: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgb(14, 30, 31)',
    borderRadius: 12,
    
    // borderWidth: 1,
    // borderColor: 'rgba(255, 179, 0, 0.25)',
  },
  aiAdvisoryLabel: {
    color: '#ba0101',
    fontSize: 10.5,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  aiAdvisoryFieldValue:{ color: "#d4d2d2", fontSize: 12, lineHeight: 15 ,fontStyle: 'italic'},
  aiFieldValue: { color: C.text, fontSize: 13.5, lineHeight: 20 },
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
    backgroundColor: C.surface2,
  },
  aiGenerateText: { color: C.ai, fontSize: 13, fontWeight: '700' },
  directorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 100,
    paddingRight: 16,
    paddingLeft: 4,
    paddingVertical: 4,
    marginRight: 10,
  },
  directorImg: { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface2 },
  directorName: { color: C.white, fontSize: 13, fontWeight: '700' },
  directorRole: { color: C.muted, fontSize: 11, fontWeight: '500' },
  castImg: { borderRadius: 12, backgroundColor: C.surface2, marginBottom: 6 },
  castName: { color: C.white, fontSize: 12, fontWeight: '600' },
  castCharacter: { color: C.muted, fontSize: 10.5, fontWeight: '400', marginTop: 1 },
  seasonPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: C.surface,
  },
  seasonPillActive: { backgroundColor: C.white },
  seasonPillText: { color: C.mutedSoft, fontSize: 12.5, fontWeight: '600' },
  seasonPillActiveText: { color: '#000', fontWeight: '700' },
  epRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 10,
    padding: 8,
    borderRadius: 14,
    backgroundColor: C.surface,
  },
  epRowActive: { backgroundColor: 'rgba(255,214,10,0.08)' },
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
  epNum: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
  epTitle: { color: C.white, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  epOverview: { color: C.mutedSoft, fontSize: 11, lineHeight: 15 },
  showMoreEpBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: C.surface2,
    marginTop: 6,
  },
  showMoreEpText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
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