import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  ToastAndroid,
  Alert,
  useWindowDimensions,
  Linking,
  BackHandler,
  DimensionValue,
  DeviceEventEmitter,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { LegendList } from '@legendapp/list/react-native';
import { useSelector } from '@legendapp/state/react';
import { savedStore$, syncSavedStore, toggleWatchlistGlobal } from '../../src/state/savedState';
import { LoadingIndicator } from '../../src/components/shared/LoadingIndicator';
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
import { getProgress, isEpisodeCompleted } from '../../src/utils/progress';
import { pollCloudChangesIfStale } from '../../src/cloudSync';
import {
  getSavedItems,
  addSavedItem,
  removeSavedItem,
  hasSavedItem,
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
import { useAppTheme, getActiveGlowShadow } from '../../src/theme';
import { useImagePalette, warmPaletteForMedia, AMBIENT_PENDING_BG } from '../../src/utils/colorExtractor';

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;
const INITIAL_EPISODES_LIMIT = 8;

const runAfterTransition = (cb: () => void, delayMs = 320) => {
  let isCancelled = false;
  let rafId: number | null = null;
  const timer = setTimeout(() => {
    if (isCancelled) return;
    rafId = requestAnimationFrame(() => {
      if (!isCancelled) cb();
    });
  }, delayMs);

  return () => {
    isCancelled = true;
    clearTimeout(timer);
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
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

const AIShimmerBar = ({ width: w = '100%', height = 12 }: { width?: string | number; height?: number }) => {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: w as any, height, borderRadius: 6, backgroundColor: colors.surfaceContainerHigh, marginBottom: 8 }} />
  );
};

const EpisodeShimmer = React.memo(({ thumbWidth }: { thumbWidth: number }) => {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.epRow, { backgroundColor: colors.surfaceContainer }]}>
      <ShimmerBlock width={thumbWidth} height={thumbWidth * 0.56} borderRadius={10} />
      <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
        <ShimmerBlock width="35%" height={10} />
        <ShimmerBlock width="85%" height={14} />
        <ShimmerBlock width="100%" height={12} />
      </View>
    </View>
  );
});

const CardShimmer = React.memo(({ width, height }: { width: DimensionValue; height: DimensionValue }) => (
  <View style={{ width, marginRight: 12 }}>
    <ShimmerBlock width={width} height={height} borderRadius={12} />
    <View style={{ marginTop: 8, gap: 6 }}>
      <ShimmerBlock width="80%" height={12} />
      <ShimmerBlock width="50%" height={10} />
    </View>
  </View>
));

const MemoizedSimilarCard = React.memo(({ item, cardWidth, isAmbientActive, onPress }: any) => {
  const { colors } = useAppTheme();
  const posterUrl = getImageUrl(item.poster_path, 'w342');
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={[styles.similarCard, { width: cardWidth }]}
      onPress={() => onPress(item)}
    >
      <Image
        source={{ uri: posterUrl }}
        style={[styles.similarImg, { width: cardWidth, height: cardWidth * 1.5, backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer }]}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={posterUrl}
      />
      <View style={styles.ratingBadge}>
        <Ionicons name="star" size={9} color={C.gold} />
        <Text style={styles.ratingText}>{item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</Text>
      </View>
      <Text style={[styles.similarTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]} numberOfLines={2}>
        {item.title || item.name}
      </Text>
    </TouchableOpacity>
  );
});

const MemoizedDirectorCard = React.memo(({ item, mediaType, isAmbientActive, onPress }: any) => {
  const { colors } = useAppTheme();
  const profileUrl = item.profile_path
    ? getImageUrl(item.profile_path, 'w185')
    : 'https://via.placeholder.com/150';
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={[
        styles.directorCard,
        { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
        isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
      ]}
      onPress={() => onPress(item.id, item)}
    >
      <Image
        source={{ uri: profileUrl }}
        style={[styles.directorImg, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainerHigh }]}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={profileUrl}
      />
      <View style={{ maxWidth: 140 }}>
        <Text style={[styles.directorName, { color: isAmbientActive ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[styles.directorRole, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]} numberOfLines={1}>
          {item.role || (mediaType === 'tv' ? 'Creator' : 'Director')}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const MemoizedCastCard = React.memo(({ item, cardWidth, isAmbientActive, onPress }: any) => {
  const { colors } = useAppTheme();
  const profileUrl = item.profile_path
    ? getImageUrl(item.profile_path, 'w185')
    : 'https://via.placeholder.com/150';
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={{ width: cardWidth }}
      onPress={() => onPress(item.id, item)}
    >
      <Image
        source={{ uri: profileUrl }}
        style={[styles.castImg, { width: cardWidth, height: cardWidth * 1.35, backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer }]}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={profileUrl}
      />
      <Text style={[styles.castName, { color: isAmbientActive ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
        {item.name}
      </Text>
      {item.character ? (
        <Text style={[styles.castCharacter, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]} numberOfLines={1}>
          {item.character}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const MemoizedEpisodeRow = React.memo(({ ep, isActive, isPlayed, episodeThumbWidth, isAmbientActive, onPlay }: any) => {
  const { colors } = useAppTheme();
  const stillUrl = ep.still_path
    ? getImageUrl(ep.still_path, 'w185')
    : 'https://via.placeholder.com/150';
  return (
    <TouchableOpacity
      activeOpacity={0.92}
      style={[
        styles.epRow,
        { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.06)' : colors.surfaceContainer },
        isActive && {
          backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.14)' : colors.badgeBg,
          borderWidth: 1,
          borderColor: isAmbientActive ? 'rgba(255, 255, 255, 0.35)' : colors.primary,
        },
        isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
      ]}
      onPress={() => onPlay(ep)}
    >
      <View style={{ position: 'relative' }}>
        <Image
          source={{ uri: stillUrl }}
          style={[styles.epThumb, { width: episodeThumbWidth, height: episodeThumbWidth * 0.56, backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainerHigh }]}
          contentFit="cover"
          cachePolicy="disk"
          recyclingKey={stillUrl}
        />
        <View style={styles.epPlayOverlay}>
          <Ionicons name="play" size={16} color="#FFF" />
        </View>
        {isActive ? <View style={[styles.epActiveDot, { backgroundColor: isAmbientActive ? '#FFFFFF' : colors.primary }]} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[
              styles.epNum,
              { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary },
              isActive && { color: isAmbientActive ? '#FFFFFF' : colors.primary, fontWeight: '800' }
            ]}>
              EPISODE {ep.episode_number}
            </Text>
            {isPlayed ? (
              <Ionicons name="checkmark-circle" size={13} color="#30D158" />
            ) : null}
          </View>
          {ep.air_date ? (
            <Text style={{ fontSize: 11, color: isAmbientActive ? 'rgba(255, 255, 255, 0.60)' : colors.textSecondary }}>
              {dayjs(ep.air_date).format('MMM D, YYYY')}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.epTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
          {ep.name}
        </Text>
        <Text style={[styles.epOverview, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]} numberOfLines={2}>
          {ep.overview}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

/* =========================================================================
   MICRO-RENDERED SUB-COMPONENTS (Isolated State & Zero Root Re-renders)
   ========================================================================= */

interface MovieActionDockProps {
  movie: any;
  isAmbientActive?: boolean;
}

const MovieActionDock = React.memo(({ movie, isAmbientActive }: MovieActionDockProps) => {
  const { colors } = useAppTheme();
  const movieId = movie?.id;
  const isInWatchlist = useSelector(() => {
    if (!movieId) return false;
    const current = savedStore$.savedIds.get();
    return current ? current.has(Number(movieId)) : false;
  });
  const isWatched = useSelector(() => {
    if (!movieId) return false;
    const current = savedStore$.watchedIds.get();
    return current ? current.has(Number(movieId)) : false;
  });

  const toggleWatchlist = useCallback(() => {
    if (!movie) return;
    toggleWatchlistGlobal(movie);
  }, [movie]);

  const toggleWatched = useCallback(async () => {
    if (!movie) return;
    const exists = hasSavedItem(movie.id, 'history');
    try {
      if (exists) {
        removeSavedItem(movie.id, 'history');
        // If movie belongs to a collection, unmarking a movie means the collection is no longer fully watched
        if (movie.belongs_to_collection?.id) {
          if (hasSavedItem(movie.belongs_to_collection.id, 'history')) {
            removeSavedItem(movie.belongs_to_collection.id, 'history');
          }
        }
      } else {
        addSavedItem(movie, 'history');
        logTasteEvent({
          entity_type: movie.media_type === 'tv' ? 'tv' : 'movie',
          entity_id: movie.id,
          entity_name: movie.title || movie.name,
          genres: movie.genres,
          weight: TASTE_WEIGHTS.COMPLETED_WATCH,
        });

        // Automatically un-toggle Watchlist
        if (hasSavedItem(movie.id, 'watchlist')) {
          removeSavedItem(movie.id, 'watchlist');
        }

        // Check if all movies in the collection are now watched
        if (movie.belongs_to_collection?.id) {
          const colDetails = await getCollectionDetails(movie.belongs_to_collection.id);
          if (colDetails?.parts && colDetails.parts.length > 0) {
            const allWatched = colDetails.parts.every((part: any) =>
              part.id === movie.id || hasSavedItem(part.id, 'history')
            );
            if (allWatched) {
              if (hasSavedItem(colDetails.id, 'watchlist')) {
                removeSavedItem(colDetails.id, 'watchlist');
              }
              if (!hasSavedItem(colDetails.id, 'history')) {
                addSavedItem(colDetails, 'history');
              }
              if (Platform.OS === 'android') {
                ToastAndroid.show(`${colDetails.name} completed!`, ToastAndroid.SHORT);
              }
            }
          }
        }
      }
    } finally {
      syncSavedStore();
    }
  }, [movie]);

  const openTelegramSearch = useCallback(() => {
    if (!movie) return;
    const title = movie.title || movie.name;
    const year = (movie.release_date || movie.first_air_date)?.substring(0, 4) || '';
    const message = encodeURIComponent(`${title} ${year}`);
    Linking.openURL(`tg://msg?text=${message}`).catch(() =>
      Linking.openURL(`https://t.me/share/url?text=${message}`)
    );
  }, [movie]);

  return (
    <View style={styles.actionRow}>
      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.actionBtn,
          { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
          isInWatchlist && (isAmbientActive ? { backgroundColor: 'rgba(255, 255, 255, 0.16)' } : { backgroundColor: colors.badgeBg }),
          isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
        ]}
        onPress={toggleWatchlist}
      >
        <Ionicons
          name={isInWatchlist ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={isInWatchlist ? (isAmbientActive ? '#FFFFFF' : colors.primary) : (isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.text)}
        />
        <Text style={[styles.actionBtnText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }, isInWatchlist && { color: isAmbientActive ? '#FFFFFF' : colors.primary, fontWeight: '700' }]}>
          Watchlist
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.actionBtn,
          { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
          isWatched && (isAmbientActive ? { backgroundColor: 'rgba(48, 209, 88, 0.16)' } : styles.actionBtnActive),
          isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
        ]}
        onPress={toggleWatched}
      >
        <Ionicons
          name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
          size={18}
          color={isWatched ? C.green : (isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary)}
        />
        <Text style={[styles.actionBtnText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }, isWatched && { color: C.green }]}>Watched</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.actionBtn,
          { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
          isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
        ]}
        onPress={openTelegramSearch}
      >
        <Ionicons name="paper-plane-outline" size={17} color={isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary} />
        <Text style={[styles.actionBtnText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>Telegram</Text>
      </TouchableOpacity>
    </View>
  );
});

interface MovieOverviewProps {
  overview?: string;
  isAmbientActive?: boolean;
}

const MovieOverview = React.memo(({ overview, isAmbientActive }: MovieOverviewProps) => {
  const { colors } = useAppTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  if (!overview) return null;
  const isLong = overview.length > 220;

  return (
    <View style={styles.section}>
      <Text style={[styles.overviewText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.88)' : colors.text }]}>
        {isExpanded || !isLong ? overview : `${overview.slice(0, 220)}…`}
      </Text>
      {isLong ? (
        <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpanded((prev) => !prev)}>
          <Text style={[styles.readMore, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>{isExpanded ? 'Less' : 'Read more'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

interface PlayCTAButtonProps {
  sourceStatus: 'checking' | 'available' | 'unavailable';
  lastWatched: any;
  mediaType?: string;
  isAmbientMode?: boolean;
  targetSeason?: number;
  targetEpisode?: number;
  isCompleted?: boolean;
  isNext?: boolean;
  onPlay: () => void;
}

const PlayCTAButton = React.memo(({
  sourceStatus,
  lastWatched,
  mediaType,
  isAmbientMode,
  targetSeason,
  targetEpisode,
  isCompleted,
  isNext,
  onPlay,
}: PlayCTAButtonProps) => {
  const { colors, isDark, useMaterialYou } = useAppTheme();
  const isUnavailable = sourceStatus === 'unavailable';
  const isChecking = sourceStatus === 'checking';
  const isCompletedShow = isCompleted ?? isEpisodeCompleted(lastWatched);
  const sNum = targetSeason || lastWatched?.lastSeason || 1;
  const eNum = targetEpisode || lastWatched?.lastEpisode || 1;

  const label = isChecking
    ? 'Finding stream'
    : isUnavailable
    ? 'Unavailable'
    : lastWatched
    ? mediaType === 'tv'
      ? isCompletedShow
        ? isNext !== false
          ? `Play S${sNum} · E${eNum}`
          : `Watch Again`
        : `Resume S${sNum} · E${eNum}`
      : isCompletedShow
      ? 'Watch Again'
      : 'Resume'
    : 'Play';

  const buttonBg = isUnavailable
    ? (isAmbientMode ? 'rgba(255, 255, 255, 0.15)' : colors.surfaceContainerHigh)
    : isAmbientMode
    ? 'rgba(255, 255, 255, 0.92)'
    : useMaterialYou
    ? colors.primary
    : isDark
    ? '#FFFFFF'
    : (colors.surfaceVariant || '#E5E7EB');

  const contentColor = isUnavailable
    ? (isAmbientMode ? 'rgba(255, 255, 255, 0.45)' : colors.textMuted)
    : isAmbientMode
    ? '#000000'
    : useMaterialYou
    ? colors.onPrimary
    : isDark
    ? '#000000'
    : colors.text;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[
        styles.primaryCtaBtn,
        { backgroundColor: buttonBg },
        isAmbientMode ? { elevation: 0, shadowOpacity: 0 } : null,
      ]}
      onPress={onPlay}
      disabled={sourceStatus !== 'available'}
    >
      <Ionicons
        name={lastWatched ? 'play-skip-forward' : 'play'}
        size={20}
        color={contentColor}
      />
      <Text style={[styles.primaryCtaText, { color: contentColor }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

interface MovieAIPanelProps {
  movie: any;
  releaseYear: string;
  directors: any[];
  genres: any[];
  similarCardWidth: number;
  renderSimilarItem: (props: any) => React.ReactElement;
  isAmbientActive?: boolean;
}

const MovieAIPanel = React.memo(({
  movie,
  releaseYear,
  directors,
  genres,
  similarCardWidth,
  renderSimilarItem,
  isAmbientActive,
}: MovieAIPanelProps) => {
  const { colors } = useAppTheme();
  const [aiTab, setAiTab] = useState<'lens' | 'chat' | 'vibe'>('lens');
  const [lensInsight, setLensInsight] = useState<any>(null);
  const [lensLoading, setLensLoading] = useState(false);
  const [lensError, setLensError] = useState<string | null>(null);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [vibeError, setVibeError] = useState<string | null>(null);
  const lensControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      lensControllerRef.current?.abort();
    };
  }, []);

  const fetchLensInsight = useCallback(async () => {
    if (!movie || (!movie.title && !movie.name)) return;
    lensControllerRef.current?.abort();
    const controller = new AbortController();
    lensControllerRef.current = controller;
    setLensLoading(true);
    setLensError(null);
    setLensInsight(null);
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('https://watcher-api-rho.vercel.app/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          action: 'lens',
          title: movie.title || movie.name,
          mediaType: movie.media_type,
          year: (movie.release_date || movie.first_air_date)?.substring(0, 4) || '',
          overview: movie.overview?.slice(0, 500) || '',
          customApiKey: GLOBAL_CONFIG.customApiKey,
        }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const data = await response.json();
      if (!isMountedRef.current) return;
      if (data?.result) setLensInsight(data.result);
      else setLensError(data?.error || 'No insight returned.');
    } catch (e: any) {
      if (!isMountedRef.current) return;
      if (e?.name === 'AbortError') {
        setLensError('Request timed out. Please try again.');
      } else {
        setLensError(e.message || 'Failed to fetch Lens insight.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (isMountedRef.current) setLensLoading(false);
    }
  }, [movie]);

  const fetchAiRecommendations = useCallback(async () => {
    if (!movie || (!movie.title && !movie.name)) return;
    setLoadingAi(true);
    setVibeError(null);
    try {
      const aiData = await getGeminiMoviesSimilarTo(
        movie.title || movie.name,
        movie.media_type,
        movie.id,
        { priority: 'high', throwOnError: true },
      );
      if (!isMountedRef.current) return;
      if (!aiData || aiData.length === 0) {
        setVibeError('No vibe recommendations found.');
      }
      setAiRecommendations(aiData || []);
    } catch (e: any) {
      if (!isMountedRef.current) return;
      const isTimeout =
        e?.code === 'ECONNABORTED' ||
        e?.code === 'ETIMEDOUT' ||
        (typeof e?.message === 'string' && e.message.toLowerCase().includes('timeout'));
      setVibeError(
        isTimeout
          ? 'Request timed out. Please try again.'
          : 'Failed to load recommendations. Please try again.',
      );
      setAiRecommendations([]);
    } finally {
      if (isMountedRef.current) setLoadingAi(false);
    }
  }, [movie]);

  return (
    <View
      style={[
        styles.aiPanel,
        { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.06)' : colors.surfaceContainer },
        isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
      ]}
    >
      <View style={styles.aiHeader}>
        <View style={styles.aiHeaderLeft}>
          <MaterialCommunityIcons name="creation" size={18} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
          <Text style={[styles.aiHeaderTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>AI Insights</Text>
        </View>
        <View style={[styles.aiTabs, { backgroundColor: isAmbientActive ? 'rgba(0, 0, 0, 0.25)' : colors.surfaceContainerHigh }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.aiTab, aiTab === 'lens' && { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.16)' : colors.badgeBg }]}
            onPress={() => {
              setAiTab('lens');
              if (!lensInsight && !lensLoading) fetchLensInsight();
            }}
          >
            <Text style={[styles.aiTabText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }, aiTab === 'lens' && { color: isAmbientActive ? '#FFFFFF' : colors.primary, fontWeight: '700' }]}>Lens</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.aiTab, aiTab === 'chat' && { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.16)' : colors.badgeBg }]}
            onPress={() => setAiTab('chat')}
          >
            <Text style={[styles.aiTabText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }, aiTab === 'chat' && { color: isAmbientActive ? '#FFFFFF' : colors.primary, fontWeight: '700' }]}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.aiTab, aiTab === 'vibe' && { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.16)' : colors.badgeBg }]}
            onPress={() => setAiTab('vibe')}
          >
            <Text style={[styles.aiTabText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }, aiTab === 'vibe' && { color: isAmbientActive ? '#FFFFFF' : colors.primary, fontWeight: '700' }]}>Vibe</Text>
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
              <Text style={[styles.aiErrorText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>Couldn't load insight.</Text>
              <TouchableOpacity activeOpacity={0.8} onPress={fetchLensInsight} style={styles.aiRetry}>
                <Feather name="rotate-cw" size={13} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
                <Text style={[styles.aiRetryText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : lensInsight ? (
            <View>
              <View style={[styles.aiVerdictPill, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.12)' : colors.badgeBg }]}>
                <Text style={[styles.aiVerdictText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>{lensInsight.worthIt}</Text>
              </View>
              <Text style={[styles.aiFriendVerdict, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>"{lensInsight.friendVerdict}"</Text>
              {lensInsight.vibe ? (
                <View style={styles.aiField}>
                  <Text style={[styles.aiFieldLabel, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.65)' : colors.textSecondary }]}>Vibe</Text>
                  <Text style={[styles.aiFieldValue, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>{lensInsight.vibe}</Text>
                </View>
              ) : null}
              {lensInsight.whatItsActuallyAbout ? (
                <View style={styles.aiField}>
                  <Text style={[styles.aiFieldLabel, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.65)' : colors.textSecondary }]}>Story & Premise</Text>
                  <Text style={[styles.aiFieldValue, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>{lensInsight.whatItsActuallyAbout}</Text>
                </View>
              ) : null}
              {(lensInsight.certificationWarning || lensInsight.whatYoullSee) ? (
                <View style={[styles.aiAdvisory, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainerHigh }]}>
                  <Text style={[styles.aiAdvisoryLabel, { color: isAmbientActive ? '#FFD60A' : colors.primary }]}>⚠ Content Advisory</Text>
                  <Text style={[styles.aiAdvisoryFieldValue, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>{lensInsight.certificationWarning || lensInsight.whatYoullSee}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={fetchLensInsight}
              style={[
                styles.aiGenerateBtn,
                { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainerHigh },
                isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
              ]}
            >
              <MaterialCommunityIcons name="creation" size={16} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
              <Text style={[styles.aiGenerateText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Generate Lens insight</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : aiTab === 'chat' ? (
        <MovieChatSection
          movie={movie}
          releaseYear={releaseYear}
          directors={directors}
          genres={genres}
          isAmbientActive={isAmbientActive}
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
            <LegendList
              horizontal
              data={aiRecommendations}
              recycleItems={false}
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderSimilarItem}
              estimatedItemSize={similarCardWidth + 12}
              drawDistance={150}
              decelerationRate="normal"
            />
          ) : vibeError ? (
            <View>
              <Text style={[styles.aiErrorText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>
                {vibeError}
              </Text>
              <TouchableOpacity activeOpacity={0.8} onPress={fetchAiRecommendations} style={styles.aiRetry}>
                <Feather name="rotate-cw" size={13} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
                <Text style={[styles.aiRetryText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={fetchAiRecommendations}
              style={[
                styles.aiGenerateBtn,
                { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainerHigh },
                isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
              ]}
            >
              <MaterialCommunityIcons name="creation" size={16} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
              <Text style={[styles.aiGenerateText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Find similar vibes</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
});

interface MovieEpisodesSectionProps {
  seasons: any[];
  selectedSeason: number | null;
  onSelectSeason: (seasonNum: number) => void;
  loadingEpisodes: boolean;
  episodesError: string | null;
  onRetryEpisodes: () => void;
  episodes: TMDBEpisode[];
  episodesLimit: number;
  onShowMore: () => void;
  lastWatched: any;
  targetSeason?: number;
  targetEpisode?: number;
  isCompleted?: boolean;
  episodeThumbWidth: number;
  isAmbientActive?: boolean;
  onPlay: (ep: TMDBEpisode) => void;
}

const MovieEpisodesSection = React.memo(({
  seasons,
  selectedSeason,
  onSelectSeason,
  loadingEpisodes,
  episodesError,
  onRetryEpisodes,
  episodes,
  episodesLimit,
  onShowMore,
  lastWatched,
  targetSeason,
  targetEpisode,
  isCompleted,
  episodeThumbWidth,
  isAmbientActive,
  onPlay,
}: MovieEpisodesSectionProps) => {
  const { colors } = useAppTheme();
  const visibleEpisodes = episodes.slice(0, episodesLimit);

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>Episodes</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 14 }}
      >
        {seasons
          .filter((s: any) => s.season_number > 0)
          .map((s: any) => (
            <TouchableOpacity
              activeOpacity={0.8}
              key={s.id}
              style={[
                styles.seasonPill,
                { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
                selectedSeason === s.season_number && { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.22)' : colors.primary },
                isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
              ]}
              onPress={() => onSelectSeason(s.season_number)}
            >
              <Text
                style={[
                  styles.seasonPillText,
                  { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary },
                  selectedSeason === s.season_number && { color: isAmbientActive ? '#FFFFFF' : colors.onPrimary, fontWeight: '700' },
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
      ) : episodesError ? (
        <View style={[styles.epRow, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.06)' : colors.surfaceContainer, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 }]}>
          <Text style={{ color: isAmbientActive ? 'rgba(255, 255, 255, 0.75)' : colors.textSecondary, fontSize: 13, flex: 1 }}>
            {episodesError}
          </Text>
          <TouchableOpacity activeOpacity={0.8} onPress={onRetryEpisodes} style={styles.aiRetry}>
            <Feather name="rotate-cw" size={14} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
            <Text style={[styles.aiRetryText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : episodes.length === 0 ? (
        <Text style={{ color: isAmbientActive ? 'rgba(255, 255, 255, 0.65)' : colors.textSecondary, fontSize: 13 }}>
          No episodes listed for this season yet.
        </Text>
      ) : (
        <View>
          {visibleEpisodes.map((ep) => {
            const isActive = isCompleted
              ? (targetSeason === ep.season_number && targetEpisode === ep.episode_number)
              : (lastWatched?.lastSeason === ep.season_number && lastWatched?.lastEpisode === ep.episode_number);
            const isPrior = Boolean(
              lastWatched &&
              (ep.season_number < (lastWatched.lastSeason || 1) ||
               (ep.season_number === (lastWatched.lastSeason || 1) && ep.episode_number < (lastWatched.lastEpisode || 1)))
            );
            const isPlayed = isPrior || (isActive && isCompleted);
            return (
              <MemoizedEpisodeRow
                key={ep.id}
                ep={ep}
                isActive={isActive}
                isPlayed={isPlayed}
                episodeThumbWidth={episodeThumbWidth}
                isAmbientActive={isAmbientActive}
                onPlay={onPlay}
              />
            );
          })}

          {episodes.length > episodesLimit ? (
            <TouchableOpacity
              activeOpacity={0.8}
              style={[
                styles.showMoreEpBtn,
                { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
                isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
              ]}
              onPress={onShowMore}
            >
              <Text style={[styles.showMoreEpText, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>
                Show more episodes ({episodes.length - episodesLimit} remaining)
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
});

/* =========================================================================
   MAIN DETAIL PAGE
   ========================================================================= */

export default function DetailPage() {
  const router = useRouter();
  const { colors, isDark, ambientTheming } = useAppTheme();
  const { id, media_type } = useLocalSearchParams();
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isLandscape = width > height;

  const HEADER_HEIGHT = isLandscape ? height * 0.55 : height * 0.60;

  const [movie, setMovie] = useState<any>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Progressive Staging: Tier 1 (Cast/Directors) lands at 200ms; Tier 2 (Gallery/AI/Similar) pre-mounts at 450ms in the background
  // while idle (or on early scroll), completely eliminating the initial scroll micro-stutter.
  const [renderStage, setRenderStage] = useState<0 | 1>(0);
  const [hasScrolledPastFold, setHasScrolledPastFold] = useState(false);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    // Stage 1: Mount Cast & Directors once the transition lands
    const timer1 = setTimeout(() => {
      setRenderStage(1);
    }, 200);

    // Stage 2: Pre-mount remaining sections (AI, Gallery, Similar) quietly in background while user views overview
    const timer2 = setTimeout(() => {
      hasScrolledRef.current = true;
      setHasScrolledPastFold(true);
    }, 450);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const handleScroll = useCallback((e: any) => {
    if (hasScrolledRef.current) return;
    const y = e.nativeEvent?.contentOffset?.y ?? 0;
    if (y > 80) {
      hasScrolledRef.current = true;
      setHasScrolledPastFold(true);
    }
  }, []);

  // Group all secondary metadata into a single atomic extras state (movie remains immutable)
  const [extras, setExtras] = useState<{
    directors: any[];
    cast: any[];
    images: any[];
    posters: any[];
    collectionData: any | null;
    similarMovies: any[];
  }>({
    directors: [],
    cast: [],
    images: [],
    posters: [],
    collectionData: null,
    similarMovies: [],
  });

  const [extrasLoaded, setExtrasLoaded] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [lastWatched, setLastWatched] = useState<any>(null);
  const [sourceStatus, setSourceStatus] = useState<'checking' | 'available' | 'unavailable'>('available');
  const [torrentModalVisible, setTorrentModalVisible] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [castLimit, setCastLimit] = useState(15);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [episodesLimit, setEpisodesLimit] = useState(INITIAL_EPISODES_LIMIT);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const episodeRequestRef = useRef(0);
  const initialRequestRef = useRef(0);
  const similarRequestRef = useRef(0);
  const lastSyncedProgressSeasonRef = useRef<number | null>(null);

  // Derived metadata (prevents redundant state duplication & extra render cycles)
  const genres: { id: number; name: string }[] = movie?.genres || [];
  const directors = extras.directors;
  const cast = extras.cast;
  const collectionData = extras.collectionData;
  const similarMovies = extras.similarMovies;

  const similarCardWidth = isTablet ? 160 : width * 0.3;
  const castCardWidth = isTablet ? 120 : width * 0.26;
  const episodeThumbWidth = isTablet ? 200 : width * 0.34;

  const heroThumbUrl = movie?.poster_path
    ? getImageUrl(movie.poster_path, 'w185')
    : movie?.backdrop_path
    ? getImageUrl(movie.backdrop_path, 'w300')
    : null;
  const { palette, failed: paletteFailed } = useImagePalette(heroThumbUrl);

  // Palette still extracting (or being warmed by the list screen we came from):
  // enter ambient mode immediately with the neutral backdrop instead of painting
  // the default theme first and switching afterwards.
  const palettePending = Boolean(ambientTheming && heroThumbUrl && !palette && !paletteFailed);
  const isAmbientActive = Boolean(ambientTheming && (palette?.pastelDark || palettePending));

  // In ambient mode, no light mode or dark mode distinction: always use the pastel dark color
  const detailsBg = palette?.pastelDark
    ? palette.pastelDark
    : isAmbientActive
    ? AMBIENT_PENDING_BG
    : colors.background;

  const heroGradientColors: readonly [string, string, ...string[]] = isAmbientActive
    ? palette?.gradient ?? ['transparent', 'rgba(255,255,255,0.06)', AMBIENT_PENDING_BG]
    : (isDark
        ? ['rgba(10,10,11,0.1)', 'transparent', '#0B0B0E']
        : ['rgba(255,255,255,0.1)', 'transparent', '#F8F9FA']);

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

  // Phase 1: Fast initial metadata (hydrates immediately from cache/SWR + reads watch progress in parallel)
  const fetchInitial = useCallback(async () => {
    if (!id) return;
    const reqId = ++initialRequestRef.current;
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setDetailsError('Invalid title ID.');
      return;
    }

    setMovie(null);
    setDetailsError(null);
    setExtras({
      directors: [],
      cast: [],
      images: [],
      posters: [],
      collectionData: null,
      similarMovies: [],
    });
    setExtrasLoaded(false);
    setSimilarError(null);
    setLoadingSimilar(false);
    similarRequestRef.current += 1;
    setSelectedSeason(null);
    setEpisodes([]);
    setEpisodesError(null);
    lastSyncedProgressSeasonRef.current = null;

    try {
      const [data, progress] = await Promise.all([
        getMediaDetails(numericId, (media_type as 'movie' | 'tv') || 'movie', 'US', {
          priority: 'high',
          onBackgroundUpdate: (freshData) => {
            if (reqId === initialRequestRef.current && freshData?.id) {
              setMovie(freshData);
              if (freshData.media_type === 'tv' && freshData.seasons && freshData.seasons.length > 0) {
                const validSeasons = freshData.seasons.filter((s: any) => s.season_number > 0);
                const fallbackSeason = validSeasons[0]?.season_number ?? freshData.seasons[0]?.season_number;
                if (fallbackSeason !== undefined) {
                  setSelectedSeason((prev) => prev ?? fallbackSeason);
                }
              }
            }
          },
        }),
        getProgress(numericId).catch(() => null),
      ]);

      if (reqId !== initialRequestRef.current) return;

      setLastWatched(progress);
      lastSyncedProgressSeasonRef.current = progress?.lastSeason ?? null;
      setMovie(data);

      if (data.media_type === 'tv' && data.seasons && data.seasons.length > 0) {
        const validSeasons = data.seasons.filter((s: any) => s.season_number > 0);
        const preferredSeason =
          progress?.lastSeason && data.seasons.some((s: any) => s.season_number === progress.lastSeason)
            ? progress.lastSeason
            : (validSeasons[0]?.season_number ?? data.seasons[0]?.season_number);
        if (preferredSeason !== undefined) {
          setSelectedSeason(preferredSeason);
        }
      }
    } catch {
      if (reqId === initialRequestRef.current) {
        setDetailsError('Unable to load this title. Check your connection or retry.');
      }
    }
  }, [id, media_type]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Phase 2: Deferred crew, cast, collection, and recommendations (fires as soon as movie.id AND renderStage >= 1)
  const loadSimilar = useCallback(async (movieId: number, mediaType: 'movie' | 'tv') => {
    const reqId = ++similarRequestRef.current;
    setLoadingSimilar(true);
    setSimilarError(null);
    try {
      const similarData = await getSimilarMedia(movieId, mediaType, 1, { priority: 'high', throwOnError: true });
      if (reqId !== similarRequestRef.current) return;
      setExtras((prev) => ({ ...prev, similarMovies: similarData || [] }));
    } catch {
      if (reqId !== similarRequestRef.current) return;
      setSimilarError("Couldn't load similar titles.");
    } finally {
      if (reqId === similarRequestRef.current) setLoadingSimilar(false);
    }
  }, []);

  useEffect(() => {
    if (!movie?.id || renderStage < 1) return;
    let isActive = true;

    const hasInlineDetails = Array.isArray(movie.cast);
    const fullDetailsPromise = hasInlineDetails
      ? Promise.resolve(movie)
      : getFullDetails({ id: movie.id, media_type: movie.media_type } as any, 'US', { priority: 'high' }).catch(() => null);
    const collectionPromise = movie.belongs_to_collection?.id
      ? getCollectionDetails(movie.belongs_to_collection.id, { priority: 'high' }).catch(() => null)
      : Promise.resolve(null);
    const similarPromise = getSimilarMedia(movie.id, movie.media_type, 1, { priority: 'high', throwOnError: true })
      .then((items) => ({ items, failed: false }))
      .catch(() => ({ items: [], failed: true }));

    Promise.all([
      fullDetailsPromise,
      collectionPromise,
      similarPromise,
    ]).then(async ([rawFullData, colData, similarRes]) => {
      if (!isActive) return;

      const fullData: any = rawFullData || movie;
      const mergedDirectors: any[] = [];
      const addDirector = (person: any, defaultRole: string) => {
        if (!person?.id || mergedDirectors.find((entry) => entry.id === person.id)) return;
        mergedDirectors.push({
          ...person,
          role: person.job || defaultRole,
        });
      };

      const defaultRole = movie.media_type === 'tv' ? 'Creator' : 'Director';
      if (Array.isArray(fullData?.directors)) {
        fullData.directors.forEach((d: any) => addDirector(d, defaultRole));
      }
      if (fullData?.director) {
        addDirector(fullData.director, defaultRole);
      }
      const crew = fullData?.crew || fullData?.credits?.crew || [];
      const creators = fullData?.created_by || [];
      const dirFromCrew = crew.filter(
        (p: any) => p.job === 'Director' || p.department === 'Directing'
      );
      [...creators, ...dirFromCrew].forEach((person: any) => addDirector(person, defaultRole));

      let extraImages = fullData?.images || [];
      let extraPosters = fullData?.posters || [];

      if (!Array.isArray(fullData?.images) && !Array.isArray(fullData?.posters)) {
        try {
          const imgs = await getMediaImages(movie.id, movie.media_type, { priority: 'high' });
          if (isActive) {
            extraImages = imgs.backdrops || [];
            extraPosters = imgs.posters || [];
          }
        } catch {}
      }

      if (!isActive) return;

      setSimilarError(similarRes.failed ? "Couldn't load similar titles." : null);
      // Commit secondary metadata atomically into extras; NEVER mutate movie
      setExtras({
        directors: mergedDirectors,
        cast: fullData?.cast || [],
        images: extraImages,
        posters: extraPosters,
        collectionData: colData,
        similarMovies: similarRes.items || [],
      });
      setExtrasLoaded(true);
    }).catch(() => {
      if (isActive) setExtrasLoaded(true);
    });

    return () => {
      isActive = false;
    };
  }, [movie?.id, movie?.media_type, movie?.belongs_to_collection?.id, renderStage]);

  const prefetchSources = useCallback(
    async (
      tmdbId: number,
      mediaType: string,
      title: string,
      seasonToTry = 1,
      episodeToTry = 1
    ) => {
      // Direct stream sources (Vidy, VidLink) are ready immediately; Watcher Engine is removed
      setSourceStatus('available');
    },
    []
  );

  useFocusEffect(
    useCallback(() => {
      if (!movie?.id) return;
      let isActive = true;
      getProgress(movie.id).then((progress) => {
        if (!isActive) return;
        setLastWatched(progress);
        const nextProgressSeason = progress?.lastSeason ?? null;
        if (
          movie.media_type === 'tv' &&
          nextProgressSeason &&
          nextProgressSeason !== lastSyncedProgressSeasonRef.current
        ) {
          lastSyncedProgressSeasonRef.current = nextProgressSeason;
          setSelectedSeason(nextProgressSeason);
        }
        const s = movie.media_type === 'tv' ? (progress?.lastSeason || 1) : 1;
        const e = movie.media_type === 'tv' ? (progress?.lastEpisode || 1) : 1;
        prefetchSources(movie.id, movie.media_type, movie.title || movie.name || '', s, e);
      });
      syncSavedStore();
      void pollCloudChangesIfStale(10000);
      return () => {
        isActive = false;
      };
    }, [movie?.id, movie?.media_type, prefetchSources])
  );

  const fetchEpisodes = useCallback(async (seasonNumber: number) => {
    if (!movie?.id) return;
    const reqId = ++episodeRequestRef.current;
    setLoadingEpisodes(true);
    setEpisodesError(null);
    setEpisodesLimit(INITIAL_EPISODES_LIMIT);
    try {
      const data = await getSeasonEpisodes(movie.id, seasonNumber, {
        priority: 'high',
        onBackgroundUpdate: (freshEpisodes) => {
          if (reqId === episodeRequestRef.current) {
            setEpisodes(freshEpisodes);
          }
        },
      });
      if (reqId === episodeRequestRef.current) {
        setEpisodes(data);
      }
    } catch {
      if (reqId === episodeRequestRef.current) {
        setEpisodes([]);
        setEpisodesError("Couldn't load episodes for this season.");
      }
    } finally {
      if (reqId === episodeRequestRef.current) setLoadingEpisodes(false);
    }
  }, [movie?.id]);

  useEffect(() => {
    if (selectedSeason !== null && movie?.media_type === 'tv') {
      fetchEpisodes(selectedSeason);
    }
  }, [selectedSeason, movie?.media_type, fetchEpisodes]);

  // Keep progress in sync when updated in background or cloud sync
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('watcher_watch_progress_changed', () => {
      if (movie?.id) {
        getProgress(movie.id).then((progress) => {
          setLastWatched(progress);
        });
      }
    });
    return () => sub.remove();
  }, [movie?.id]);

  // Completion & Next Episode calculation
  const isCompleted = useMemo(() => isEpisodeCompleted(lastWatched), [lastWatched]);
  const { targetPlaySeason, targetPlayEpisode, isNext } = useMemo(() => {
    if (movie?.media_type !== 'tv') {
      return { targetPlaySeason: 1, targetPlayEpisode: 1, isNext: false };
    }
    if (lastWatched) {
      const lastS = lastWatched.lastSeason || 1;
      const lastE = lastWatched.lastEpisode || 1;
      if (!isCompleted) {
        return { targetPlaySeason: lastS, targetPlayEpisode: lastE, isNext: false };
      }
      // Completed: calculate next episode
      const currentSeasonMeta = movie.seasons?.find((s: any) => s.season_number === lastS);
      const epCount = currentSeasonMeta?.episode_count || (episodes.length > 0 && selectedSeason === lastS ? episodes.length : 999);
      if (lastE < epCount) {
        return { targetPlaySeason: lastS, targetPlayEpisode: lastE + 1, isNext: true };
      } else {
        const nextSeasonMeta = movie.seasons?.find((s: any) => s.season_number > lastS && s.episode_count > 0);
        if (nextSeasonMeta) {
          return { targetPlaySeason: nextSeasonMeta.season_number, targetPlayEpisode: 1, isNext: true };
        } else {
          // Whole series finished
          return { targetPlaySeason: lastS, targetPlayEpisode: lastE, isNext: false };
        }
      }
    }
    if (episodes.length > 0) {
      return {
        targetPlaySeason: episodes[0].season_number || 1,
        targetPlayEpisode: episodes[0].episode_number || 1,
        isNext: false,
      };
    }
    return { targetPlaySeason: selectedSeason || 1, targetPlayEpisode: 1, isNext: false };
  }, [movie, lastWatched, isCompleted, episodes, selectedSeason]);

  const handlePlay = useCallback((episode?: TMDBEpisode) => {
    let targetSeason = 1;
    let targetEpisode = 1;
    if (episode) {
      targetSeason = episode.season_number;
      targetEpisode = episode.episode_number;
    } else if (movie.media_type === 'tv') {
      targetSeason = (isCompleted && !isNext) ? 1 : targetPlaySeason;
      targetEpisode = (isCompleted && !isNext) ? 1 : targetPlayEpisode;
    }

    let previousSeason: number | undefined;
    let previousEpisode: number | undefined;
    let nextSeason: number | undefined;
    let nextEpisode: number | undefined;
    const seasonCounts = movie.media_type === 'tv'
      ? (movie.seasons || [])
        .filter((item: any) => item.season_number > 0 && item.episode_count > 0)
        .map((item: any) => [item.season_number, item.episode_count])
      : [];

    if (movie.media_type === 'tv') {
      const seasonEpisodes = episodes
        .filter((item) => item.season_number === targetSeason)
        .sort((a, b) => a.episode_number - b.episode_number);
      const currentIndex = seasonEpisodes.findIndex((item) => item.episode_number === targetEpisode);
      const currentSeasonCount = seasonCounts.find(([seasonNumber]: number[]) => seasonNumber === targetSeason)?.[1];

      if (currentIndex > 0) {
        previousSeason = targetSeason;
        previousEpisode = seasonEpisodes[currentIndex - 1].episode_number;
      } else if (currentIndex < 0 && targetEpisode > 1) {
        previousSeason = targetSeason;
        previousEpisode = targetEpisode - 1;
      } else {
        const previousSeasonMeta = (movie.seasons || [])
          .filter((item: any) => item.season_number > 0 && item.episode_count > 0 && item.season_number < targetSeason)
          .sort((a: any, b: any) => b.season_number - a.season_number)[0];
        if (previousSeasonMeta) {
          previousSeason = previousSeasonMeta.season_number;
          previousEpisode = previousSeasonMeta.episode_count;
        }
      }

      const following = currentIndex >= 0
        ? seasonEpisodes[currentIndex + 1]
        : targetEpisode < (currentSeasonCount || 0)
          ? { season_number: targetSeason, episode_number: targetEpisode + 1 }
          : undefined;
      if (following) {
        nextSeason = following.season_number;
        nextEpisode = following.episode_number;
      } else {
        const nextSeasonMeta = (movie.seasons || [])
          .filter((item: any) => item.season_number > targetSeason && item.episode_count > 0)
          .sort((a: any, b: any) => a.season_number - b.season_number)[0];
        if (nextSeasonMeta) {
          nextSeason = nextSeasonMeta.season_number;
          nextEpisode = 1;
        }
      }
    }

    const previousParams = previousSeason && previousEpisode
      ? `&previousSeason=${previousSeason}&previousEpisode=${previousEpisode}`
      : '';
    const nextParams = nextSeason && nextEpisode
      ? `&nextSeason=${nextSeason}&nextEpisode=${nextEpisode}`
      : '';
    const guideParams = seasonCounts.length > 0
      ? `&seasonCounts=${encodeURIComponent(JSON.stringify(seasonCounts))}`
      : '';
    router.push(
      `/player?id=${movie.id}&media_type=${movie.media_type}&title=${encodeURIComponent(
        movie.title || movie.name
      )}&season=${targetSeason}&episode=${targetEpisode}&poster=${encodeURIComponent(
        movie.poster_path || ''
      )}&episodeName=${encodeURIComponent(episode ? episode.name : `Episode ${targetEpisode}`)}${previousParams}${nextParams}${guideParams}`
    );
  }, [sourceStatus, movie, isCompleted, isNext, targetPlaySeason, targetPlayEpisode, episodes, router]);

  const copyTitle = useCallback(async () => {
    if (!movie) return;
    const text = `${movie.title || movie.name} ${(movie.release_date || movie.first_air_date)?.substring(0, 4) || ''}`;
    await Clipboard.setStringAsync(text);
    if (Platform.OS === 'android') ToastAndroid.show('Copied!', ToastAndroid.SHORT);
  }, [movie]);


  const renderSimilarItem = useCallback(
    ({ item }: any) => (
      <MemoizedSimilarCard
        item={item}
        cardWidth={similarCardWidth}
        isAmbientActive={isAmbientActive}
        onPress={(clicked: any) => {
          warmPaletteForMedia(clicked);
          router.push(`/movie/${clicked.id}?media_type=${clicked.media_type || 'movie'}`);
        }}
      />
    ),
    [similarCardWidth, isAmbientActive, router]
  );

  const displayTitle = movie?.title || movie?.name;
  const rawDate = movie?.release_date || movie?.first_air_date;
  const releaseYear = rawDate ? dayjs(rawDate).format('MMM YYYY') : '';

  if (!movie) {
    if (!detailsError) return <MovieDetailSkeleton />;
    return (
      <View style={[styles.root, styles.detailsLoading, { backgroundColor: colors.background }]}>
        <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)');
            }}
            style={styles.glassBtn}
          >
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
        <Ionicons name="alert-circle-outline" size={44} color={colors.textSecondary} />
        <Text style={[styles.detailsError, { color: colors.textSecondary }]}>{detailsError}</Text>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            setDetailsError(null);
            void fetchInitial();
          }}
        >
          <Ionicons name="refresh" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: detailsBg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isAmbientActive || isDark ? "light-content" : "dark-content"} />

      {/* Lightweight Static Hero Backdrop */}
      <View style={[styles.heroContainer, { height: HEADER_HEIGHT, backgroundColor: detailsBg }]} pointerEvents="none">
        <Image
          source={{ uri: getImageUrl(movie.poster_path, 'w500') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
          priority="high"
          // contentPosition={{ top: 40, left: 'center' }}
        />
        <LinearGradient
          colors={heroGradientColors}
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
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Main Single Scroll Container */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
      >
        {/* Lowered Details Card Spacer */}
        <View style={{ height: HEADER_HEIGHT - 30 }} />

        <View style={[styles.cardTop, { backgroundColor: detailsBg }]}>
          {releaseYear ? (
            <Text style={[styles.heroEyebrow, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>
              {movie.media_type === 'tv' ? 'SERIES' : 'FILM'} · {releaseYear}
            </Text>
          ) : null}

          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: isAmbientActive ? '#FFFFFF' : colors.text }]} numberOfLines={3}>
              {displayTitle}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={copyTitle} style={styles.copyBtn}>
              <Feather name="copy" size={16} color={isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Core Metadata */}
          <View style={styles.metaRow}>
            {movie.runtime && movie.runtime > 0 ? (
              <Text style={[styles.metaText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>
                {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
              </Text>
            ) : null}
            {movie.vote_average && movie.vote_average > 0 ? (
              <View style={styles.metaInline}>
                {movie.runtime && movie.runtime > 0 ? <Text style={[styles.metaDot, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.45)' : colors.textSecondary }]}>·</Text> : null}
                <Ionicons name="star" size={11} color="#FFD60A" />
                <Text style={[styles.metaText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary, marginLeft: 4 }]}>
                  {movie.vote_average.toFixed(1)}
                </Text>
              </View>
            ) : null}
            {movie.certification ? (
              <View style={styles.metaInline}>
                <Text style={[styles.metaDot, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.45)' : colors.textSecondary }]}>·</Text>
                <View style={[styles.certPill, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.12)' : colors.surfaceContainer }]}>
                  <Text style={[styles.certText, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>{movie.certification}</Text>
                </View>
              </View>
            ) : null}
            {movie.media_type === 'tv' && movie.number_of_seasons ? (
              <View style={styles.metaInline}>
                <Text style={[styles.metaDot, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.45)' : colors.textSecondary }]}>·</Text>
                <Text style={[styles.metaText, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>{movie.number_of_seasons} Seasons</Text>
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
                    style={[
                      styles.genreCard,
                      { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer, borderWidth: 0 },
                      isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
                    ]}
                    onPress={() =>
                      router.push(
                        `/viewall?title=${encodeURIComponent(g.name)}&type=${encodeURIComponent(
                          `genre/${g.id}`
                        )}`
                      )
                    }
                  >
                    <Ionicons name={iconName} size={13} color={isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary} style={styles.genreCardIcon} />
                    <Text style={[styles.genreCardText, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>{g.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {/* Primary Play CTA (Micro-rendered status updates) */}
          <PlayCTAButton
            sourceStatus={sourceStatus}
            lastWatched={lastWatched}
            mediaType={movie.media_type}
            isAmbientMode={isAmbientActive}
            targetSeason={targetPlaySeason}
            targetEpisode={targetPlayEpisode}
            isCompleted={isCompleted}
            isNext={isNext}
            onPlay={() => handlePlay()}
          />

          {/* Primary Download CTA */}
          <TouchableOpacity
            activeOpacity={0.9}
            style={[
              styles.primaryCtaBtn,
              styles.downloadCtaBtn,
              { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer },
              isAmbientActive ? { elevation: 0, shadowOpacity: 0 } : null,
            ]}
            onPress={() => setTorrentModalVisible(true)}
          >
            <Feather name="download" size={19} color={isAmbientActive ? '#FFFFFF' : colors.text} />
            <Text style={[styles.primaryCtaText, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>Download</Text>
          </TouchableOpacity>

          {/* Micro-rendered Action Dock: Watchlist, Watched, Telegram */}
          <MovieActionDock
            movie={movie}
            isAmbientActive={isAmbientActive}
          />

          {/* Micro-rendered Overview */}
          <MovieOverview
            overview={movie.overview}
            isAmbientActive={isAmbientActive}
          />

          {/* TIER 1: Directors & Cast (Mounts first, immediately below overview) */}
          {renderStage >= 1 && (
            <>
              {/* Directors with In-Page Skeleton Placeholder */}
              {(!extrasLoaded || directors.length > 0) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>
                  {movie.media_type === 'tv' ? 'Created by' : 'Directed by'}
                </Text>
                {!extrasLoaded ? (
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
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 10 }}
                  >
                    {directors.map((director: any) => (
                      <MemoizedDirectorCard
                        key={director.id}
                        item={director}
                        mediaType={movie?.media_type}
                        isAmbientActive={isAmbientActive}
                        onPress={(personId: number, person?: any) => {
                          warmPaletteForMedia(person);
                          router.push(`/cast/${personId}`);
                        }}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
              ) : null}

              {/* Cast with In-Page Skeleton Placeholder */}
              {(!extrasLoaded || cast.length > 0) ? (
              <View style={styles.section}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0, color: isAmbientActive ? '#FFFFFF' : colors.text }]}>
                    Cast {cast && cast.length > 0 ? `(${cast.length})` : ''}
                  </Text>
                  {cast && cast.length > 15 ? (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setCastLimit((prev) => (prev >= cast.length ? 15 : cast.length))}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: isAmbientActive ? '#FFFFFF' : colors.primary }}>
                        {castLimit >= cast.length ? 'Show Less' : `Show All (${cast.length})`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!extrasLoaded ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <CardShimmer key={i} width={castCardWidth} height={castCardWidth * 1.35} />
                    ))}
                  </ScrollView>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12 }}
                  >
                    {cast.slice(0, castLimit).map((castMember: any) => (
                      <MemoizedCastCard
                        key={castMember.id}
                        item={castMember}
                        cardWidth={castCardWidth}
                        isAmbientActive={isAmbientActive}
                        onPress={(personId: number, person?: any) => {
                          warmPaletteForMedia(person);
                          router.push(`/cast/${personId}`);
                        }}
                      />
                    ))}
                    {cast.length > castLimit && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        style={[
                          styles.castLoadMoreCard,
                          {
                            width: castCardWidth,
                            height: castCardWidth * 1.35,
                            backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.08)' : colors.surfaceContainer,
                          }
                        ]}
                        onPress={() => setCastLimit((prev) => Math.min(prev + 15, cast.length))}
                      >
                        <Ionicons name="chevron-forward-circle" size={26} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
                        <Text style={[styles.castLoadMoreText, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>
                          +{Math.min(15, cast.length - castLimit)} More
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                )}
              </View>
              ) : null}

              {/* TV Episodes with In-Page Skeleton Placeholder */}
              {movie.media_type === 'tv' && movie.seasons && movie.seasons.length > 0 ? (
                <MovieEpisodesSection
                  seasons={movie.seasons}
                  selectedSeason={selectedSeason}
                  onSelectSeason={(seasonNum) => setSelectedSeason(seasonNum)}
                  loadingEpisodes={loadingEpisodes}
                  episodesError={episodesError}
                  onRetryEpisodes={() => {
                    if (selectedSeason !== null) void fetchEpisodes(selectedSeason);
                  }}
                  episodes={episodes}
                  episodesLimit={episodesLimit}
                  onShowMore={() => setEpisodesLimit((prev) => prev + 15)}
                  lastWatched={lastWatched}
                  targetSeason={targetPlaySeason}
                  targetEpisode={targetPlayEpisode}
                  isCompleted={isCompleted}
                  episodeThumbWidth={episodeThumbWidth}
                  isAmbientActive={isAmbientActive}
                  onPlay={handlePlay}
                />
              ) : null}
            </>
          )}

          {/* TIER 2: Mounts only when the user scrolls down, NEVER on launch */}
          {hasScrolledPastFold && (
            <>
              {/* Collection Banner */}
              {movie.belongs_to_collection ? (
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
                    <Text style={[styles.collectionSubtitle, { color: isAmbientActive ? 'rgba(255, 255, 255, 0.70)' : colors.textSecondary }]}>
                      Part of a Collection {collectionData?.parts?.length ? `• ${collectionData.parts.length} Movies` : ''}
                    </Text>
                    <Text style={styles.collectionName} numberOfLines={2}>
                      {movie.belongs_to_collection.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {/* Micro-rendered AI Insights Panel */}
              <MovieAIPanel
                movie={movie}
                releaseYear={releaseYear}
                directors={directors}
                genres={genres}
                similarCardWidth={similarCardWidth}
                renderSimilarItem={renderSimilarItem}
                isAmbientActive={isAmbientActive}
              />

              {/* Photos & Scene Images Gallery */}
              <MovieMediaGallery
                backdrops={extras.images}
                posters={extras.posters}
                fallbackBackdrop={movie.backdrop_path}
                fallbackPoster={movie.poster_path}
                title={displayTitle}
                isAmbientActive={isAmbientActive}
              />

              {/* Similar Titles with In-Page Skeleton Placeholder */}
              {(!extrasLoaded || loadingSimilar || similarError || similarMovies.length > 0) ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: isAmbientActive ? '#FFFFFF' : colors.text }]}>More like this</Text>
                {(!extrasLoaded || loadingSimilar) ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <CardShimmer key={i} width={similarCardWidth} height={similarCardWidth * 1.5} />
                    ))}
                  </ScrollView>
                ) : similarError && similarMovies.length === 0 ? (
                  <View style={[styles.epRow, { backgroundColor: isAmbientActive ? 'rgba(255, 255, 255, 0.06)' : colors.surfaceContainer, justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 }]}>
                    <Text style={{ color: isAmbientActive ? 'rgba(255, 255, 255, 0.75)' : colors.textSecondary, fontSize: 13, flex: 1 }}>
                      {similarError}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => void loadSimilar(movie.id, movie.media_type)}
                      style={styles.aiRetry}
                    >
                      <Feather name="rotate-cw" size={14} color={isAmbientActive ? '#FFFFFF' : colors.primary} />
                      <Text style={[styles.aiRetryText, { color: isAmbientActive ? '#FFFFFF' : colors.primary }]}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <LegendList
                    horizontal
                    data={similarMovies}
                    recycleItems={true}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderSimilarItem}
                    estimatedItemSize={similarCardWidth + 12}
                    drawDistance={300}
                    decelerationRate="fast"
                  />
                )}
              </View>
              ) : null}
            </>
          )}
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
  metaInline: { flexDirection: 'row', alignItems: 'center' },
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
  },
  aiVerdictText: {
    color: C.ai,
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
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
  aiAdvisoryFieldValue: { color: '#d4d2d2', fontSize: 12, lineHeight: 15, fontStyle: 'italic' },
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
  castLoadMoreCard: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
  },
  castLoadMoreText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
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
  detailsLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 14,
  },
  detailsError: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 100,
    marginTop: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});