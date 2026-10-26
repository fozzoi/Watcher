import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LoadingIndicator } from '../shared/LoadingIndicator';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getSavedItems, subscribeToSavedItemsChanges, hasSavedItem } from '../../database';
import { toggleWatchlistGlobal } from '../../state/savedState';
import { getTrendingToday, getImageUrl, TMDBResult } from '../../tmdb';
import { warmPaletteForMedia } from '../../utils/colorExtractor';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ChromeStyleWidgetProps {
  onOpenSearch?: () => void;
  onSelectTrending?: () => void;
}

export const ChromeStyleWidget = memo(({ onOpenSearch, onSelectTrending }: ChromeStyleWidgetProps) => {
  const router = useRouter();

  // Watchlist Count state (live SQLite sync)
  const [watchlistCount, setWatchlistCount] = useState<number>(() => {
    try {
      return getSavedItems('watchlist').length;
    } catch {
      return 0;
    }
  });

  // Trending Today state
  const [trendingItems, setTrendingItems] = useState<TMDBResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loadingTrending, setLoadingTrending] = useState<boolean>(true);
  const [isCurrentInWatchlist, setIsCurrentInWatchlist] = useState<boolean>(false);

  // Sync Watchlist Count & current item watchlist status
  const syncWatchlistState = useCallback(() => {
    try {
      const items = getSavedItems('watchlist');
      setWatchlistCount(items.length);

      const currentItem = trendingItems[currentIndex];
      if (currentItem?.id) {
        setIsCurrentInWatchlist(hasSavedItem(currentItem.id, 'watchlist'));
      }
    } catch (e) {
      console.warn('ChromeStyleWidget: failed to sync watchlist state', e);
    }
  }, [trendingItems, currentIndex]);

  useEffect(() => {
    syncWatchlistState();
    const unsubscribe = subscribeToSavedItemsChanges(() => {
      syncWatchlistState();
    });
    return unsubscribe;
  }, [syncWatchlistState]);

  // Fetch Trending Today from TMDB
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoadingTrending(true);
        const results = await getTrendingToday('all', 1);
        if (isMounted && results && results.length > 0) {
          // Take top 8 trending items for the carousel
          const validResults = results.slice(0, 8);
          setTrendingItems(validResults);
          if (validResults[0]?.id) {
            setIsCurrentInWatchlist(hasSavedItem(validResults[0].id, 'watchlist'));
          }
        }
      } catch (err) {
        console.warn('ChromeStyleWidget: error fetching trending today', err);
      } finally {
        if (isMounted) setLoadingTrending(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update current item watchlist state when index changes
  useEffect(() => {
    const currentItem = trendingItems[currentIndex];
    if (currentItem?.id) {
      setIsCurrentInWatchlist(hasSavedItem(currentItem.id, 'watchlist'));
    }
  }, [currentIndex, trendingItems]);

  // Handlers
  const handleSearchPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onOpenSearch) {
      onOpenSearch();
    } else {
      router.push('/(tabs)/search');
    }
  }, [onOpenSearch, router]);

  const handleWatchlistPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/(tabs)/watchlist');
  }, [router]);

  const handleTrendingPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (onSelectTrending) {
      onSelectTrending();
    } else {
      router.push({
        pathname: '/viewall',
        params: { title: 'Trending Today', type: 'trending' },
      });
    }
  }, [onSelectTrending, router]);

  const handleAiChatPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/(tabs)/aichat');
  }, [router]);

  const handleSurpriseMe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (trendingItems.length > 0) {
      const randomIndex = Math.floor(Math.random() * trendingItems.length);
      const randomItem = trendingItems[randomIndex];
      warmPaletteForMedia(randomItem);
      const mediaType = randomItem.media_type || (randomItem.first_air_date ? 'tv' : 'movie');
      router.push(`/movie/${randomItem.id}?media_type=${mediaType}`);
    }
  }, [trendingItems, router]);

  const handleNextTrending = useCallback(() => {
    if (trendingItems.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    setCurrentIndex((prev) => (prev + 1) % trendingItems.length);
  }, [trendingItems.length]);

  const handlePrevTrending = useCallback(() => {
    if (trendingItems.length === 0) return;
    Haptics.selectionAsync().catch(() => {});
    setCurrentIndex((prev) => (prev - 1 + trendingItems.length) % trendingItems.length);
  }, [trendingItems.length]);

  const handleToggleCurrentWatchlist = useCallback(() => {
    const currentItem = trendingItems[currentIndex];
    if (!currentItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    toggleWatchlistGlobal(currentItem);
    setIsCurrentInWatchlist((prev) => !prev);
  }, [trendingItems, currentIndex]);

  const handleOpenCurrentItem = useCallback(() => {
    const currentItem = trendingItems[currentIndex];
    if (!currentItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    warmPaletteForMedia(currentItem);
    const mediaType = currentItem.media_type || (currentItem.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${currentItem.id}?media_type=${mediaType}`);
  }, [trendingItems, currentIndex, router]);

  const currentItem = trendingItems[currentIndex];
  const releaseYear = currentItem?.release_date
    ? new Date(currentItem.release_date).getFullYear()
    : currentItem?.first_air_date
    ? new Date(currentItem.first_air_date).getFullYear()
    : null;

  const isTv = currentItem?.media_type === 'tv' || !!currentItem?.first_air_date;

  return (
    <View style={styles.widgetWrapper}>
      {/* Background with modern glassy border */}
      <LinearGradient
        colors={['#1c1c24', '#131318']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      >
        {/* ============================================================== */}
        {/* 1. CHROME SEARCH PILL                                         */}
        {/* ============================================================== */}
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={handleSearchPress}
          style={styles.searchPill}
        >
          {/* Watcher Brand Icon */}
          <View style={styles.brandBadge}>
            <Ionicons name="film" size={17} color="#E50914" />
          </View>

          {/* Search Placeholder */}
          <Text style={styles.searchPlaceholder} numberOfLines={1}>
            Search movies, series, cast...
          </Text>

          {/* Right Action Icons (Mic & Sparkles) */}
          <View style={styles.searchPillActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleSearchPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.searchPillIconBtn}
            >
              <Ionicons name="mic-outline" size={18} color="#9E9EA7" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleAiChatPress}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.searchPillIconBtn}
            >
              <Ionicons name="sparkles" size={16} color="#E50914" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* ============================================================== */}
        {/* 2. CHROME-STYLE QUICK ACCESS SHORTCUT BUTTONS                 */}
        {/* ============================================================== */}
        <View style={styles.quickAccessRow}>
          {/* Quick Search */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSearchPress}
            style={styles.shortcutItem}
          >
            <View style={[styles.shortcutCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
              <Ionicons name="search" size={20} color="#60A5FA" />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>Search</Text>
          </TouchableOpacity>

          {/* Watchlist with Live Count */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleWatchlistPress}
            style={styles.shortcutItem}
          >
            <View style={[styles.shortcutCircle, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
              <Ionicons name="bookmark" size={20} color="#FBBF24" />
              {watchlistCount > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>
                    {watchlistCount > 99 ? '99+' : watchlistCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>Watchlist</Text>
          </TouchableOpacity>

          {/* Trending Shortcut */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleTrendingPress}
            style={styles.shortcutItem}
          >
            <View style={[styles.shortcutCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
              <Ionicons name="flame" size={20} color="#F87171" />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>Trending</Text>
          </TouchableOpacity>

          {/* AI Muse Shortcut */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleAiChatPress}
            style={styles.shortcutItem}
          >
            <View style={[styles.shortcutCircle, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
              <Ionicons name="sparkles" size={19} color="#C084FC" />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>AI Muse</Text>
          </TouchableOpacity>

          {/* Surprise Me / Dice */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleSurpriseMe}
            style={styles.shortcutItem}
          >
            <View style={[styles.shortcutCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <Ionicons name="dice-outline" size={20} color="#34D399" />
            </View>
            <Text style={styles.shortcutLabel} numberOfLines={1}>Surprise</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.sectionDivider} />

        {/* ============================================================== */}
        {/* 3. TRENDING TODAY LIVE SUB-WIDGET CARD                        */}
        {/* ============================================================== */}
        <View style={styles.trendingHeaderRow}>
          <View style={styles.trendingTitleGroup}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
            </View>
            <Text style={styles.trendingSectionTitle}>TRENDING TODAY</Text>
          </View>

          {/* Carousel Pagination Controls */}
          {trendingItems.length > 1 && (
            <View style={styles.carouselControls}>
              <Text style={styles.carouselCounter}>
                {currentIndex + 1} / {trendingItems.length}
              </Text>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handlePrevTrending}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.arrowButton}
              >
                <Ionicons name="chevron-back" size={16} color="#CCCCCC" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleNextTrending}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.arrowButton}
              >
                <Ionicons name="chevron-forward" size={16} color="#CCCCCC" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Trending Card Content */}
        {loadingTrending ? (
          <View style={styles.loadingContainer}>
            <LoadingIndicator size="small" />
            <Text style={styles.loadingText}>Fetching today's trends...</Text>
          </View>
        ) : currentItem ? (
          <View style={styles.trendingCardContainer}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleOpenCurrentItem}
              style={styles.trendingCardMain}
            >
              {/* Media Poster / Thumbnail */}
              <View style={styles.posterWrapper}>
                <Image
                  source={{ uri: getImageUrl(currentItem.poster_path || currentItem.backdrop_path || null, 'w342') }}
                  style={styles.posterImage}
                  contentFit="cover"
                  transition={250}
                />
                {/* Format Tag */}
                <View style={styles.mediaTypeBadge}>
                  <Text style={styles.mediaTypeText}>{isTv ? 'SERIES' : 'MOVIE'}</Text>
                </View>
              </View>

              {/* Media Info */}
              <View style={styles.mediaInfoContainer}>
                {/* Title */}
                <Text style={styles.mediaTitle} numberOfLines={1}>
                  {currentItem.title || currentItem.name}
                </Text>

                {/* Metadata Row: Rating & Year */}
                <View style={styles.metadataRow}>
                  {currentItem.vote_average > 0 && (
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={12} color="#FBBF24" />
                      <Text style={styles.ratingText}>
                        {currentItem.vote_average.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {releaseYear && (
                    <Text style={styles.yearText}>•  {releaseYear}</Text>
                  )}
                </View>

                {/* Overview preview */}
                <Text style={styles.overviewText} numberOfLines={2}>
                  {currentItem.overview || 'No synopsis available.'}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Quick Action Footer inside Card */}
            <View style={styles.cardActionsRow}>
              {/* Details / Play Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleOpenCurrentItem}
                style={styles.playButton}
              >
                <Ionicons name="play" size={14} color="#FFFFFF" />
                <Text style={styles.playButtonText}>View Details</Text>
              </TouchableOpacity>

              {/* Watchlist Toggle Button */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleToggleCurrentWatchlist}
                style={[
                  styles.watchlistToggleBtn,
                  isCurrentInWatchlist && styles.watchlistToggleBtnActive,
                ]}
              >
                <Ionicons
                  name={isCurrentInWatchlist ? 'checkmark' : 'add'}
                  size={16}
                  color={isCurrentInWatchlist ? '#34D399' : '#FFFFFF'}
                />
                <Text
                  style={[
                    styles.watchlistToggleText,
                    isCurrentInWatchlist && styles.watchlistToggleTextActive,
                  ]}
                >
                  {isCurrentInWatchlist ? 'Watchlist' : 'Add to List'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No trending items found for today.</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  );
});

ChromeStyleWidget.displayName = 'ChromeStyleWidget';

const styles = StyleSheet.create({
  widgetWrapper: {
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#16161D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  cardGradient: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
  },

  /* 1. CHROME SEARCH PILL */
  searchPill: {
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  brandBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    color: '#9E9EA7',
    fontWeight: '400',
  },
  searchPillActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 4,
  },
  searchPillIconBtn: {
    padding: 4,
  },

  /* 2. QUICK ACCESS BUTTONS */
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 6,
  },
  shortcutItem: {
    alignItems: 'center',
    width: (SCREEN_WIDTH - 80) / 5,
  },
  shortcutCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  shortcutLabel: {
    marginTop: 6,
    fontSize: 11,
    color: '#B0B0B8',
    fontWeight: '500',
    textAlign: 'center',
  },
  countBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#E50914',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#16161D',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  /* SECTION DIVIDER */
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 14,
    marginHorizontal: 2,
  },

  /* 3. TRENDING TODAY LIVE SUB-WIDGET */
  trendingHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  trendingTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#EF4444',
  },
  trendingSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#E0E0E6',
  },
  carouselControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  carouselCounter: {
    fontSize: 11,
    color: '#8A8A93',
    fontWeight: '600',
  },
  arrowButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* CARD BODY */
  trendingCardContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  trendingCardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  posterWrapper: {
    width: 76,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#26262E',
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  mediaTypeBadge: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mediaTypeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  mediaInfoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  mediaTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
    marginBottom: 4,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  yearText: {
    fontSize: 11,
    color: '#8A8A93',
    fontWeight: '500',
  },
  overviewText: {
    fontSize: 12,
    color: '#A0A0AA',
    lineHeight: 16,
  },

  /* QUICK ACTION BUTTONS FOOTER */
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  playButton: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E50914',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  playButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  watchlistToggleBtn: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  watchlistToggleBtnActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  watchlistToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E0E0E6',
  },
  watchlistToggleTextActive: {
    color: '#34D399',
  },

  /* LOADING & EMPTY STATES */
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#8A8A93',
  },
  emptyContainer: {
    paddingVertical: 18,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: '#8A8A93',
  },
});

export default ChromeStyleWidget;
