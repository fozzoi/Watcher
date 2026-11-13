// app/(tabs)/index.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  memo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  StatusBar,
  TouchableOpacity,
  BackHandler,
  Keyboard,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';

import { LoadingIndicator as SharedLoadingIndicator } from '../../src/components/shared/LoadingIndicator';

import { toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
import { pollCloudChangesWithResult } from '../../src/cloudSync';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useAnimatedScrollHandler,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSavedItems,
  getExploreContentCacheSync,
} from '../../src/database';
import {
  getForYouShelvesSync,
  subscribeToForYouShelves,
  refreshForYouShelvesIfNeeded,
  ForYouShelf,
  isMediaReleased,
} from '../../src/services/tasteProfile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB,
  searchPeople,
  searchCollections,
  getTrendingToday,
  parseQueryYear,
} from '../../src/tmdb';
import { getUserPreferences } from '../../src/userPreferences';

// --- COMPONENTS ---
import SkeletonHero from '../../src/components/explore/SkeletonHero';
import HeroSection, { heroScroll$ } from '../../src/components/explore/HeroSection';
import GenreFilter from '../../src/components/explore/GenreFilter';
import MediaCarousel from '../../src/components/shared/MediaCarousel';
import RankedTop10Carousel from '../../src/components/explore/RankedTop10Carousel';
import SpotlightCarousel from '../../src/components/explore/SpotlightCarousel';
import WorldCinemaHub from '../../src/components/explore/WorldCinemaHub';
import SearchResultsList from '../../src/components/search/SearchResultsList';
import SearchEmptyState from '../../src/components/search/SearchEmptyState';
import { HORIZONTAL_MARGIN, GENRE_DATA, POPULAR_FRANCHISE_COLLECTIONS } from '../../src/components/explore/ExploreConstants';
import { useAppTheme, shadows } from '../../src/theme';

/* =========================================================================
   PERFORMANCE HELPERS (Aligned with Movie & Cast Detail Pages)
   ========================================================================= */
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

type SectionLayoutType = 'ranked' | 'spotlight' | 'world_hub' | 'standard';

type ExploreSection = {
  key: string;
  title: string;
  type: string;
  layout: SectionLayoutType;
  data: any;
  eyebrow?: string;
};

const emitExploreScroll = (y: number) => {
  DeviceEventEmitter.emit('exploreScroll', y);
};

const updateHeroScrollOut = (isOut: boolean) => {
  if (heroScroll$.isScrolledOut.peek() !== isOut) {
    heroScroll$.isScrolledOut.set(isOut);
  }
};

/* =========================================================================
   MICRO-RENDERED SUB-COMPONENTS (Isolated State & Zero Root Re-renders)
   ========================================================================= */

interface ExploreHeaderProps {
  contentLoading: boolean;
  rawContent: any;
  heroItems?: any[];
  selectedGenre: number;
  onSelectGenre: (genreId: number) => void;
  toggleWatchlist: (item: any) => void;
}

const ExploreHeader = memo(
  ({
    contentLoading,
    rawContent,
    heroItems,
    selectedGenre,
    onSelectGenre,
    toggleWatchlist,
  }: ExploreHeaderProps) => {
    if (contentLoading && !rawContent) {
      return (
        <View style={styles.headerContainer}>
          <SkeletonHero />
          <GenreFilter selectedGenre={selectedGenre} onSelectGenre={onSelectGenre} />
        </View>
      );
    }
    return (
      <View style={styles.headerContainer}>
        <HeroSection
          items={heroItems && heroItems.length ? heroItems : (rawContent?.heroMovies || rawContent?.trendingMovies || [])}
          toggleWatchlist={toggleWatchlist}
        />
        <GenreFilter selectedGenre={selectedGenre} onSelectGenre={onSelectGenre} />
      </View>
    );
  },
  (prev, next) =>
    prev.contentLoading === next.contentLoading &&
    prev.rawContent === next.rawContent &&
    prev.heroItems === next.heroItems &&
    prev.selectedGenre === next.selectedGenre
);

const ExploreSectionItem = memo(
  ({
    item,
    toggleWatchlist,
    onExploreAll,
  }: {
    item: ExploreSection;
    toggleWatchlist: (item: any) => void;
    onExploreAll: (item: ExploreSection) => void;
  }) => {
    switch (item.layout) {
      case 'ranked':
        return (
          <RankedTop10Carousel
            data={item.data}
            toggleWatchlist={toggleWatchlist}
          />
        );
      case 'spotlight':
        return (
          <SpotlightCarousel
            title={item.title}
            eyebrow={item.eyebrow}
            data={item.data}
            onExploreAll={() => onExploreAll(item)}
          />
        );
      case 'world_hub':
        return (
          <WorldCinemaHub
            langData={item.data}
            toggleWatchlist={toggleWatchlist}
          />
        );
      case 'standard':
      default:
        return (
          <MediaCarousel
            title={item.title}
            type={item.type}
            data={item.data}
            toggleWatchlist={toggleWatchlist}
          />
        );
    }
  },
  (prev, next) =>
    prev.item.key === next.item.key &&
    prev.item.data === next.item.data &&
    prev.item.title === next.item.title
);

interface ExploreSearchControllerProps {
  isExpanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  animatedBgStyle: any;
  animatedSearchStyle: any;
  animatedHeaderStyle: any;
  toggleWatchlist: (item: any) => void;
  isSearchFocusedShared: SharedValue<boolean>;
  inSearchModeShared: SharedValue<boolean>;
  trendingItems?: any[];
  personalizedItems?: any[];
}

const ExploreSearchController = memo(
  ({
    isExpanded,
    onOpen,
    onClose,
    animatedBgStyle,
    animatedSearchStyle,
    animatedHeaderStyle,
    toggleWatchlist,
    isSearchFocusedShared,
    inSearchModeShared,
    trendingItems,
    personalizedItems,
  }: ExploreSearchControllerProps) => {
    const router = useRouter();
    const { colors, isDark } = useAppTheme();
    const [query, setQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [tmdbResults, setTmdbResults] = useState<any[]>([]);
    const [peopleResults, setPeopleResults] = useState<any[]>([]);
    const [searchError, setSearchError] = useState<string | null>(null);
    const searchTimeout = useRef<any>(null);
    const searchReqIdRef = useRef(0);

    const loadSearchHistory = useCallback(async () => {
      try {
        const currentStr = await AsyncStorage.getItem('searchHistoryExpl');
        if (currentStr) {
          const parsed = JSON.parse(currentStr);
          if (Array.isArray(parsed)) setRecentSearches(parsed);
        }
      } catch {}
    }, []);

    useEffect(() => {
      loadSearchHistory();
    }, [loadSearchHistory]);

    const saveSearchToHistory = async (searchText: string) => {
      const trimmed = searchText.trim();
      if (!trimmed) return;
      try {
        const updated = [
          trimmed,
          ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
        ].slice(0, 15);
        setRecentSearches(updated);
        await AsyncStorage.setItem('searchHistoryExpl', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    };

    const handleRemoveRecent = async (itemToRemove: string) => {
      const updated = recentSearches.filter((i) => i !== itemToRemove);
      setRecentSearches(updated);
      await AsyncStorage.setItem('searchHistoryExpl', JSON.stringify(updated));
    };

    const handleClearAllRecents = async () => {
      setRecentSearches([]);
      await AsyncStorage.removeItem('searchHistoryExpl');
    };

    const handleSearch = useCallback(async (searchText: string) => {
      const trimmed = searchText.trim();
      const reqId = ++searchReqIdRef.current;
      if (!trimmed) {
        setTmdbResults([]);
        setPeopleResults([]);
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      setSearchError(null);

      try {
        const { cleanTitle, year } = parseQueryYear(trimmed);
        const searchCollectionQuery = year && cleanTitle ? cleanTitle : trimmed;

        const [moviesRes, peopleRes, collectionsRes] = await Promise.allSettled([
          searchTMDB(trimmed, 1, { priority: 'high', throwOnError: true }),
          searchPeople(cleanTitle || trimmed, 1, { priority: 'high', throwOnError: true }),
          searchCollections(searchCollectionQuery, 1, { priority: 'high', throwOnError: true }),
        ]);

        if (reqId !== searchReqIdRef.current) return;

        const movies = moviesRes.status === 'fulfilled' ? moviesRes.value : [];
        const people = peopleRes.status === 'fulfilled' ? peopleRes.value : [];
        const collections = collectionsRes.status === 'fulfilled' ? collectionsRes.value : [];

        const validMovies = movies.filter((item: any) => item.poster_path);
        const validCollections = collections.filter((item: any) => item.poster_path);
        const validPeople = people.filter((item: any) => item.profile_path);

        const allFailed =
          moviesRes.status === 'rejected' &&
          peopleRes.status === 'rejected' &&
          collectionsRes.status === 'rejected';
        const primaryFailedWithoutResults =
          moviesRes.status === 'rejected' &&
          validCollections.length === 0 &&
          validPeople.length === 0;

        if (allFailed || primaryFailedWithoutResults) {
          setTmdbResults([]);
          setPeopleResults([]);
          setSearchError('Could not load search results. Check your connection and try again.');
          return;
        }

        setTmdbResults([...validCollections, ...validMovies]);
        setPeopleResults(validPeople);
        setSearchError(null);
      } catch (error) {
        if (reqId !== searchReqIdRef.current) return;
        console.error('Search failed', error);
        setSearchError('Could not load search results. Check your connection and try again.');
      } finally {
        if (reqId === searchReqIdRef.current) {
          setSearchLoading(false);
        }
      }
    }, []);

    useEffect(() => {
      const inSearch = query.trim() !== '';
      inSearchModeShared.value = inSearch;
      if (!query.trim()) {
        searchReqIdRef.current += 1;
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        setTmdbResults((prev) => (prev.length > 0 ? [] : prev));
        setPeopleResults((prev) => (prev.length > 0 ? [] : prev));
        setSearchError(null);
        setSearchLoading(false);
        return;
      }
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => handleSearch(query), 320);
      return () => clearTimeout(searchTimeout.current);
    }, [query, handleSearch, inSearchModeShared]);

    const handleClose = useCallback(() => {
      Keyboard.dismiss();
      setQuery('');
      isSearchFocusedShared.value = false;
      inSearchModeShared.value = false;
      onClose();
    }, [onClose, isSearchFocusedShared, inSearchModeShared]);

    useFocusEffect(
      useCallback(() => {
        const onBackPress = () => {
          if (query.trim() !== '' || isExpanded) {
            handleClose();
            return true;
          }
          return false;
        };
        const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
        return () => subscription.remove();
      }, [query, isExpanded, handleClose])
    );

    // Stable style objects: this controller re-renders on every keystroke, so
    // these literals are memoized instead of being re-allocated per character.
    const overlayStyle = useMemo(
      () => ({ zIndex: 10, backgroundColor: colors.background }),
      [colors.background]
    );
    const pillStyle = useMemo(
      () => ({
        backgroundColor: colors.surfaceContainer,
        borderColor: isDark ? colors.outlineVariant : 'rgba(0, 0, 0, 0.08)',
        borderWidth: StyleSheet.hairlineWidth,
      }),
      [colors.surfaceContainer, colors.outlineVariant, isDark]
    );
    const inputStyle = useMemo(() => ({ color: colors.text }), [colors.text]);

    return (
      <>
        {/* Interactive Search Overlay */}
        {isExpanded && (
          <Animated.View
            style={[StyleSheet.absoluteFill, overlayStyle, animatedBgStyle]}
          >
            {query.trim() === '' ? (
              <SearchEmptyState
                recentSearches={recentSearches}
                onSelectQuery={(selected) => {
                  setQuery(selected);
                  saveSearchToHistory(selected);
                }}
                onRemoveRecent={handleRemoveRecent}
                onClearAllRecents={handleClearAllRecents}
                trendingItems={trendingItems}
                personalizedItems={personalizedItems}
                toggleWatchlist={toggleWatchlist}
              />
            ) : searchError && tmdbResults.length === 0 && peopleResults.length === 0 && !searchLoading ? (
              <View style={styles.stateErrorContainer}>
                <Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />
                <Text style={[styles.stateErrorTitle, { color: colors.text }]}>Search unavailable</Text>
                <Text style={[styles.stateErrorMessage, { color: colors.textSecondary }]}>
                  {searchError}
                </Text>
                <TouchableOpacity
                  style={[styles.stateRetryButton, { backgroundColor: colors.primary }]}
                  onPress={() => handleSearch(query)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={16} color={colors.onPrimary} />
                  <Text style={[styles.stateRetryText, { color: colors.onPrimary }]}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <SearchResultsList
                peopleResults={peopleResults}
                tmdbResults={tmdbResults}
                toggleWatchlist={toggleWatchlist}
              />
            )}
          </Animated.View>
        )}

        {/* Persistent App Header */}
        <View style={styles.headerWrapper} pointerEvents="box-none">
          <Animated.View
            style={[styles.searchBarContainer, animatedHeaderStyle]}
            pointerEvents="box-none"
          >
            <View style={styles.searchRow}>
              <Animated.View style={[styles.searchInputContainer, animatedSearchStyle, pillStyle]}>
                <View style={styles.searchIconContainer}>
                  <Ionicons name="search" size={20} color={colors.textSecondary} />
                </View>
                <TextInput
                  placeholder="Discover..."
                  placeholderTextColor={colors.textSecondary}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => {
                    isSearchFocusedShared.value = true;
                    onOpen();
                  }}
                  onSubmitEditing={() => saveSearchToHistory(query)}
                  style={[styles.searchInput, inputStyle]}
                  selectionColor={colors.primary}
                  returnKeyType="search"
                  keyboardAppearance={isDark ? "dark" : "light"}
                  underlineColorAndroid="transparent"
                  cursorColor={colors.primary}
                />
                {searchLoading ? (
                  <View style={styles.actionIcon}>
                    <SharedLoadingIndicator size={22} color={colors.primary} />
                  </View>
                ) : isExpanded ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleClose}
                    style={styles.actionIcon}
                  >
                    <MaterialIcons name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.push('/settings')}
                    style={styles.actionIcon}
                  >
                    <Ionicons name="settings-outline" size={22} color={colors.text} />
                  </TouchableOpacity>
                )}
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </>
    );
  },
  (prev, next) =>
    prev.isExpanded === next.isExpanded &&
    prev.trendingItems === next.trendingItems &&
    prev.personalizedItems === next.personalizedItems
);

/* =========================================================================
   EXPLORE PAGE ROOT
   ========================================================================= */

const ExplorePage = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const [selectedGenre, setSelectedGenre] = useState(0);

  const [rawContent, setRawContent] = useState<any>(() => getExploreContentCacheSync(0));
  const [contentLoading, setContentLoading] = useState<boolean>(() => !getExploreContentCacheSync(0));
  const [exploreError, setExploreError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [trendingToday, setTrendingToday] = useState<any[]>([]);
  const rawContentRef = useRef<any>(rawContent);

  useEffect(() => {
    rawContentRef.current = rawContent;
  }, [rawContent]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const today = await getTrendingToday('all', 1, {
          priority: rawContentRef.current ? 'low' : 'high',
        });
        if (isMounted && today && today.length > 0) {
          setTrendingToday(today.slice(0, 10));
        }
      } catch (err) {
        console.warn('Error fetching trending today for hero:', err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);
  const [forYouShelves, setForYouShelves] = useState<ForYouShelf[]>(() => getForYouShelvesSync());

  // Progressive Idle Staging: Tier 0 (Immediate Launch) -> Tier 1 (200ms)
  // -> Tier 2 lead (500ms) -> Tier 2 rest (850ms).
  // Mounting sections quietly in the background while idle completely eliminates
  // the initial scroll micro-stutter that occurred when mounting shelves during the drag gesture.
  const [renderStage, setRenderStage] = useState<0 | 1 | 2 | 3>(0);
  const hasScrolledShared = useSharedValue(false);
  const stageCancelRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    // Progressive background cascade during idle
    stageCancelRef.current = runAfterTransition(() => {
      setRenderStage(1);
      stageCancelRef.current = runAfterTransition(() => {
        setRenderStage(2);
        stageCancelRef.current = runAfterTransition(() => {
          setRenderStage(3);
          stageCancelRef.current = null;
        }, 350);
      }, 300);
    }, 200);

    return () => {
      stageCancelRef.current?.();
    };
  }, []);

  const feedOpacityAnim = useSharedValue(1);

  // Deferred background taste profile subscription
  useEffect(() => {
    const unsubscribe = subscribeToForYouShelves((updatedShelves) => {
      setForYouShelves(updatedShelves);
    });
    const cancelTaste = runAfterTransition(() => {
      refreshForYouShelvesIfNeeded();
    }, 400);
    return () => {
      unsubscribe();
      cancelTaste();
    };
  }, []);

  const contentRequestRef = useRef(0);
  const lastPrefsRef = useRef<string>('');
  const refreshingRef = useRef(false);
  const pendingCacheRefreshRef = useRef(false);

  const bgOpacity = useSharedValue(0);
  const searchWidthAnim = useSharedValue(0);
  const searchBarTranslateY = useSharedValue(0);
  const isBarHidden = useSharedValue(false);
  const isHeroOutShared = useSharedValue(false);
  const isPastHeroShared = useSharedValue(false);
  const isTabBarShrunkShared = useSharedValue(false);
  const lastScrollY = useSharedValue(0);
  const isSearchFocusedShared = useSharedValue(false);
  const inSearchModeShared = useSharedValue(false);

  useEffect(() => {
    if (isExpanded) {
      searchBarTranslateY.value = withTiming(0, { duration: 150 });
      DeviceEventEmitter.emit('exploreScroll', 0);
      isTabBarShrunkShared.value = false;
      isBarHidden.value = false;
    }
  }, [isExpanded]);

  useEffect(() => {
    bgOpacity.value = withTiming(isExpanded ? 1 : 0, { duration: 180 });
    searchWidthAnim.value = withTiming(isExpanded ? 1 : 0, { duration: 180 });
  }, [isExpanded]);

  const animatedBgStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
  }));

  const animatedSearchStyle = useAnimatedStyle(() => ({
    width: `${65 + searchWidthAnim.value * 35}%`,
  }));

  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: searchBarTranslateY.value }],
  }));

  const animatedFeedStyle = useAnimatedStyle(() => ({
    opacity: feedOpacityAnim.value,
  }));

  const fetchContent = useCallback(
    async (genreId: number = 0, forceRefresh: boolean = false) => {
      const requestId = ++contentRequestRef.current;
      const cached = getExploreContentCacheSync(genreId);
      setExploreError(false);
      if (!cached || (forceRefresh && !refreshingRef.current)) {
        setContentLoading(true);
      }
      try {
        const prefs = await getUserPreferences();
        const actorsKey = (prefs.favoriteActors || []).map((a: any) => a.id).join(',');
        lastPrefsRef.current = `${(prefs.languages || []).join(',')}-${(prefs.genreIds || []).join(',')}-${actorsKey}`;

        const content = await fetchPersonalisedDiscoveryContent(
          prefs.languages,
          prefs.genreIds,
          genreId,
          forceRefresh,
          prefs.favoriteActors,
          (freshContent) => {
            if (requestId === contentRequestRef.current && freshContent) {
              rawContentRef.current = freshContent;
              setRawContent(freshContent);
              setExploreError(false);
              setContentLoading(false);
            }
          }
        );
        if (requestId !== contentRequestRef.current) return;
        if (content) {
          rawContentRef.current = content;
          setRawContent(content);
          setExploreError(false);
        } else if (!cached) {
          rawContentRef.current = null;
          setRawContent(null);
          setExploreError(true);
        }
        setContentLoading(false);
        feedOpacityAnim.value = withTiming(1, { duration: 250 });

        // Defer secondary history similarity computation until after transition settles
        runAfterTransition(() => {
          const history = getSavedItems('history');
          if (history && history.length > 0) {
            getSimilarForHistory(history)
              .then((similar) => {
                if (requestId === contentRequestRef.current) {
                  setBecauseYouWatched(similar);
                }
              })
              .catch(() => {});
          } else if (requestId === contentRequestRef.current) {
            setBecauseYouWatched([]);
          }
        }, 300);
      } catch (err) {
        if (requestId === contentRequestRef.current) {
          console.error(err);
          if (!rawContentRef.current) {
            setExploreError(true);
          }
          feedOpacityAnim.value = withTiming(1, { duration: 200 });
        }
      } finally {
        if (requestId === contentRequestRef.current) setContentLoading(false);
      }
    },
    [feedOpacityAnim]
  );

  const advanceStagesOnScroll = useCallback(() => {
    setRenderStage((prev) => (prev < 2 ? 2 : prev));
    runAfterTransition(() => {
      setRenderStage(3);
    }, 200);
  }, []);

  const handleSelectGenre = useCallback(
    (genreId: number) => {
      if (genreId === selectedGenre) return;
      setSelectedGenre(genreId);
      setExploreError(false);
      hasScrolledShared.value = false;
      setRenderStage(0);

      // Cancel any pending stage timer and restart cascade for new genre
      stageCancelRef.current?.();
      stageCancelRef.current = runAfterTransition(() => {
        setRenderStage(1);
        stageCancelRef.current = runAfterTransition(() => {
          setRenderStage(2);
          stageCancelRef.current = runAfterTransition(() => {
            setRenderStage(3);
            stageCancelRef.current = null;
          }, 350);
        }, 300);
      }, 200);

      const cached = getExploreContentCacheSync(genreId);
      if (cached) {
        feedOpacityAnim.value = 0.35;
        rawContentRef.current = cached;
        setRawContent(cached);
        setContentLoading(false);
        feedOpacityAnim.value = withTiming(1, { duration: 220 });
      } else {
        rawContentRef.current = null;
        setRawContent(null);
        feedOpacityAnim.value = withTiming(0.25, { duration: 180 });
        setContentLoading(true);
      }
    },
    [selectedGenre, feedOpacityAnim]
  );

  // Cancel the pending stage timer on unmount
  useEffect(() => () => stageCancelRef.current?.(), []);

  // Listen for preference updates / cache clears from onboarding / settings
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('preferencesChanged', () => {
      fetchContent(selectedGenre, true);
    });
    const cacheSub = DeviceEventEmitter.addListener('watcher_cache_cleared', () => {
      pendingCacheRefreshRef.current = true;
      rawContentRef.current = null;
      setRawContent(null);
      setExploreError(false);
      setTrendingToday([]);
      setContentLoading(true);
    });
    return () => {
      sub.remove();
      cacheSub.remove();
    };
  }, [fetchContent, selectedGenre]);

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('exploreScroll', 0);
      isTabBarShrunkShared.value = false;
      searchBarTranslateY.value = withTiming(0, { duration: 150 });
      isBarHidden.value = false;
      syncSavedStore();
      if (pendingCacheRefreshRef.current) {
        pendingCacheRefreshRef.current = false;
        fetchContent(selectedGenre, true);
        getTrendingToday('all', 1, { priority: 'high', forceRefresh: true })
          .then((res) => res && setTrendingToday(res.slice(0, 10)))
          .catch(() => null);
        return;
      }
      getUserPreferences().then((prefs) => {
        const actorsKey = (prefs.favoriteActors || []).map((a: any) => a.id).join(',');
        const currentHash = `${(prefs.languages || []).join(',')}-${(prefs.genreIds || []).join(',')}-${actorsKey}`;
        const currentRaw = rawContentRef.current;
        const cachedLangs = currentRaw?.langData ? Object.keys(currentRaw.langData) : [];
        const isMissingUserLang =
          Boolean(currentRaw) &&
          selectedGenre === 0 &&
          (prefs.languages || []).some((l: string) => !cachedLangs.includes(l));
        if (isMissingUserLang || (lastPrefsRef.current !== '' && lastPrefsRef.current !== currentHash)) {
          fetchContent(selectedGenre, true);
        }
        lastPrefsRef.current = currentHash;
      });
    }, [fetchContent, selectedGenre])
  );

  const handleToggleWatchlist = useCallback((item: any) => {
    toggleWatchlistGlobal(item);
  }, []);

  useEffect(() => {
    fetchContent(selectedGenre, false);
  }, [selectedGenre, fetchContent]);

  const onRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    hasScrolledShared.value = false;
    setRenderStage(0);
    try {
      await Promise.all([
        fetchContent(selectedGenre, true),
        refreshForYouShelvesIfNeeded(true),
        getTrendingToday('all', 1, { priority: 'high', forceRefresh: true })
          .then((res) => res && setTrendingToday(res.slice(0, 10)))
          .catch(() => null),
        pollCloudChangesWithResult({ ignoreBackoff: true }).catch(() => null),
      ]);
      stageCancelRef.current?.();
      stageCancelRef.current = runAfterTransition(() => {
        setRenderStage(1);
        stageCancelRef.current = runAfterTransition(() => {
          setRenderStage(2);
          stageCancelRef.current = runAfterTransition(() => {
            setRenderStage(3);
            stageCancelRef.current = null;
          }, 350);
        }, 300);
      }, 200);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [selectedGenre, fetchContent]);

  // =========================================================================
  // CURATED EDITORIAL HIERARCHY
  // =========================================================================
  // Each content group is memoized on ONLY the state that feeds it. A background
  // taste-profile update then re-renders just the shelves it changed instead of
  // rebuilding every section (fresh .slice() arrays) and re-rendering all carousels.
  const topSection = useMemo<ExploreSection | null>(() => {
    if (!rawContent?.trendingMovies?.length) return null;
    // 1. Top 10 Today (Ranked Rail with Outlined Numerals)
    return {
      key: 'top-10-ranked',
      title: 'Top 10 Today',
      type: 'ranked',
      layout: 'ranked',
      data: rawContent.trendingMovies.slice(0, 10),
    };
  }, [rawContent]);

  const spotlightSection = useMemo<ExploreSection | null>(() => {
    if (!rawContent) return null;
    const todayStr = new Date().toISOString().split('T')[0];

    // 2. Franchise Spotlight (16:9 Landscape Rail - COLLECTIONS ONLY)
    if (selectedGenre === 0 && forYouShelves.length > 0) {
      const topShelf = forYouShelves[0];
      const validItems = (topShelf.items || []).filter((item: any) => {
        const isCol = Boolean(
          item.media_type === 'collection' ||
          item.collection_id ||
          item._colId ||
          item.belongs_to_collection?.id ||
          (item.parts && Array.isArray(item.parts)) ||
          item.parts_count
        );
        return isCol && isMediaReleased(item, todayStr);
      }).slice(0, 15);

      if (validItems.length > 0) {
        return {
          key: `spotlight-${topShelf.shelfId}`,
          title: topShelf.title || 'Franchise Spotlight',
          type: 'spotlight',
          layout: 'spotlight',
          eyebrow: 'COLLECTION SPOTLIGHT',
          data: validItems,
        };
      }
    }

    // Default curated iconic franchise collections fallback (Collections ONLY, never random movies!)
    if (selectedGenre === 0 && POPULAR_FRANCHISE_COLLECTIONS.length > 0) {
      return {
        key: 'spotlight-franchises',
        title: 'Franchise Spotlight',
        type: 'spotlight',
        layout: 'spotlight',
        eyebrow: 'COLLECTION SPOTLIGHT',
        data: POPULAR_FRANCHISE_COLLECTIONS,
      };
    }

    return null;
  }, [rawContent, forYouShelves, selectedGenre]);

  const midSections = useMemo<ExploreSection[]>(() => {
    if (!rawContent) return [];
    const sections: ExploreSection[] = [];
    const selectedGenreObj = GENRE_DATA.find((g) => g.id === selectedGenre);
    const selectedGenreName = selectedGenreObj && selectedGenreObj.id !== 0 ? selectedGenreObj.name : null;

    // 3. ELEVATED: Trending & Binge-Worthy TV Series
    if (rawContent.trendingTV?.length) {
      const title = selectedGenreName ? `Top ${selectedGenreName} Series` : 'Trending Series';
      sections.push({
        key: 'trending-tv',
        title,
        type: 'trendingtv',
        layout: 'standard',
        data: rawContent.trendingTV.slice(0, 15),
      });
    }

    // 4. World Cinema Hub (Collapses all international rails into one hub)
    if (rawContent.langData && Object.keys(rawContent.langData).length > 0) {
      sections.push({
        key: 'world-cinema-hub',
        title: 'World Cinema',
        type: 'world_hub',
        layout: 'world_hub',
        data: rawContent.langData,
      });
    }

    // 5. Single Featured Actor Spotlight
    if (selectedGenre === 0 && rawContent.actorData?.length) {
      const featuredActor = rawContent.actorData.find((a: any) => a.items && a.items.length > 0);
      if (featuredActor) {
        sections.push({
          key: `actor-${featuredActor.actorId}`,
          title: `Spotlight: ${featuredActor.actorName}`,
          type: `actor-${featuredActor.actorId}`,
          layout: 'standard',
          data: featuredActor.items.slice(0, 15),
        });
      }
    }

    return sections;
  }, [rawContent, selectedGenre]);

  const bywSection = useMemo<ExploreSection | null>(() => {
    if (!rawContent || selectedGenre !== 0 || becauseYouWatched.length === 0) return null;
    const primaryRec = becauseYouWatched[0];
    if (!primaryRec?.items?.length) return null;
    // 6. Personalized "Because You Watched"
    return {
      key: 'byw-primary',
      title: `Because You Watched ${primaryRec.sourceTitle}`,
      type: 'becauseyouwatched',
      layout: 'standard',
      data: primaryRec.items.slice(0, 15),
    };
  }, [becauseYouWatched, selectedGenre]);

  const secondaryShelfSection = useMemo<ExploreSection | null>(() => {
    if (!rawContent || selectedGenre !== 0 || forYouShelves.length <= 1) return null;
    const todayStr = new Date().toISOString().split('T')[0];
    const secondaryShelf = forYouShelves[1];
    const items = (secondaryShelf.items || []).filter((item: any) => isMediaReleased(item, todayStr)).slice(0, 15);
    if (items.length === 0) return null;
    // 7. Secondary Taste Profile Collection ("Your Sweet Spot")
    return {
      key: `foryou-${secondaryShelf.shelfId}`,
      title: secondaryShelf.title,
      type: `foryou-${secondaryShelf.shelfId}`,
      layout: 'standard',
      eyebrow: secondaryShelf.subtitle || undefined,
      data: items,
    };
  }, [rawContent, forYouShelves, selectedGenre]);

  const tailSections = useMemo<ExploreSection[]>(() => {
    if (!rawContent) return [];
    const sections: ExploreSection[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const selectedGenreObj = GENRE_DATA.find((g) => g.id === selectedGenre);
    const selectedGenreName = selectedGenreObj && selectedGenreObj.id !== 0 ? selectedGenreObj.name : null;

    // 8. Popular / Trending
    if (rawContent.popularMovies?.length) {
      sections.push({
        key: 'popular-movies',
        title: selectedGenreName ? `Trending in ${selectedGenreName}` : 'Trending Movies',
        type: 'popular',
        layout: 'standard',
        data: rawContent.popularMovies.slice(0, 15),
      });
    }

    // 9. In Theaters Now
    if (rawContent.nowPlaying?.length) {
      const nowPlayingReleased = rawContent.nowPlaying.filter((m: any) =>
        isMediaReleased(m.release_date, todayStr)
      );
      sections.push({
        key: 'now-playing',
        title: 'In Theaters Now',
        type: 'nowplaying',
        layout: 'standard',
        data: (nowPlayingReleased.length > 0 ? nowPlayingReleased : rawContent.nowPlaying).slice(0, 15),
      });
    }

    // 10. All-Time Masterpieces / Top Rated
    if (rawContent.topRated?.length) {
      sections.push({
        key: 'top-rated',
        title: selectedGenreName ? `Top Rated ${selectedGenreName}` : 'All-Time Masterpieces',
        type: 'toprated',
        layout: 'standard',
        data: rawContent.topRated.slice(0, 15),
      });
    }

    // 11. Nostalgic Hits
    if (rawContent.nostalgia?.length) {
      sections.push({
        key: 'nostalgia',
        title: 'Nostalgic Hits',
        type: 'nostalgia',
        layout: 'standard',
        data: rawContent.nostalgia.slice(0, 15),
      });
    }

    // 12. Animated Favorites
    if (rawContent.animatedMovies?.length) {
      sections.push({
        key: 'animated-movies',
        title: 'Animated Favorites',
        type: 'animatedmovies',
        layout: 'standard',
        data: rawContent.animatedMovies.slice(0, 15),
      });
    }

    // 13. Coming Soon to Theaters
    if (rawContent.upcoming?.length) {
      sections.push({
        key: 'upcoming',
        title: 'Coming Soon to Theaters',
        type: 'upcoming',
        layout: 'standard',
        data: rawContent.upcoming.slice(0, 15),
      });
    }

    return sections;
  }, [rawContent, selectedGenre]);

  // Merge only — section objects keep their identity so ExploreSectionItem's
  // memo comparator can skip shelves whose source data did not change.
  const exploreSections = useMemo(
    () =>
      [
        topSection,
        spotlightSection,
        ...midSections,
        bywSection,
        secondaryShelfSection,
        ...tailSections,
      ].filter((s): s is ExploreSection => s !== null),
    [topSection, spotlightSection, midSections, bywSection, secondaryShelfSection, tailSections]
  );

  // Tier slicing (matching Progressive Staging pattern)
  const tier0Sections = useMemo(() => exploreSections.slice(0, 1), [exploreSections]);
  const tier1Sections = useMemo(() => exploreSections.slice(1, 4), [exploreSections]);
  const tier2Sections = useMemo(() => exploreSections.slice(4), [exploreSections]);
  const tier2LeadSections = useMemo(() => tier2Sections.slice(0, 4), [tier2Sections]);
  const tier2LateSections = useMemo(() => tier2Sections.slice(4), [tier2Sections]);

  const handleExploreAll = useCallback((item: ExploreSection) => {
    router.push({
      pathname: '/viewall',
      params: {
        title: item.title,
        type: 'foryou-saga-all',
      },
    });
  }, [router]);

  const handleOpenSearch = useCallback(() => setIsExpanded(true), []);
  const handleCloseSearch = useCallback(() => setIsExpanded(false), []);

  // Stable references for the memoized search controller — the previous
  // inline `|| []` fallbacks allocated a new array every render, which broke
  // its memo comparator and re-rendered the header/search overlay each time.
  const searchTrendingItems = useMemo(
    () => (trendingToday.length > 0 ? trendingToday : (rawContent?.trendingMovies ?? [])),
    [trendingToday, rawContent]
  );
  const searchPersonalizedItems = useMemo(() => {
    if (becauseYouWatched.length > 0) return becauseYouWatched[0]?.items ?? [];
    return forYouShelves[0]?.items ?? [];
  }, [becauseYouWatched, forYouShelves]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;
      lastScrollY.value = currentY;

      // Tab bar shrink sync — ONLY bridge to JS when the shrink state actually changes!
      // This eliminates the 12px bridge spam that caused initial scroll micro-stutter.
      if (currentY > 50 && diff > 8 && !isTabBarShrunkShared.value) {
        isTabBarShrunkShared.value = true;
        runOnJS(emitExploreScroll)(currentY);
      } else if ((currentY <= 50 || diff < -8) && isTabBarShrunkShared.value) {
        isTabBarShrunkShared.value = false;
        runOnJS(emitExploreScroll)(currentY);
      }

      // Pause hero autoplay and animations when scrolled completely off-screen (> 450px)
      const isHeroOut = currentY > 450;
      if (isHeroOut !== isHeroOutShared.value) {
        isHeroOutShared.value = isHeroOut;
        runOnJS(updateHeroScrollOut)(isHeroOut);
      }

      // Unlock remaining stages if user begins scrolling early
      if (currentY > 80 && !hasScrolledShared.value) {
        hasScrolledShared.value = true;
        runOnJS(advanceStagesOnScroll)();
      }

      // 1. Always reveal search bar at the top
      if (currentY <= 15) {
        if (isBarHidden.value) {
          isBarHidden.value = false;
          searchBarTranslateY.value = withTiming(0, { duration: 180 });
        }
        return;
      }

      // 2. Lock search bar visible while search is open
      if (isSearchFocusedShared.value || inSearchModeShared.value) {
        return;
      }

      // 3. Scroll DOWN -> Hide search bar (latched: fires ONCE, not 60x/sec)
      if (diff > 10 && !isBarHidden.value && currentY > 80) {
        isBarHidden.value = true;
        searchBarTranslateY.value = withTiming(-100, { duration: 200 });
      }
      // 4. Scroll UP -> Reveal search bar (latched: fires ONCE)
      else if (diff < -10 && isBarHidden.value) {
        isBarHidden.value = false;
        searchBarTranslateY.value = withTiming(0, { duration: 180 });
      }
    },
  });

  // Top-bar shade removed: the status bar now adapts to the surface beneath it —
  // dark theme background => white icons, light theme background => dark icons.
  const statusBarTheme = isDark ? 'light-content' : 'dark-content';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={statusBarTheme} />

      {/* Main Smooth ScrollView with Progressive Tier Mounts (Matched with Detail Page) */}
      <Animated.ScrollView
        style={[styles.feed, animatedFeedStyle as any]}
        contentContainerStyle={styles.scrollContent}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surfaceContainer}
            progressViewOffset={(StatusBar.currentHeight || insets.top) + 72}
          />
        }
      >
          <ExploreHeader
            contentLoading={contentLoading}
            rawContent={rawContent}
            heroItems={trendingToday.length ? trendingToday : undefined}
            selectedGenre={selectedGenre}
            onSelectGenre={handleSelectGenre}
            toggleWatchlist={handleToggleWatchlist}
          />

        {!contentLoading && !rawContent ? (
          <View style={styles.stateErrorContainer}>
            <Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />
            <Text style={[styles.stateErrorTitle, { color: colors.text }]}>
              {exploreError ? 'Could not load feed' : 'Nothing to show yet'}
            </Text>
            <Text style={[styles.stateErrorMessage, { color: colors.textSecondary }]}>
              Check your internet connection or try refreshing.
            </Text>
            <TouchableOpacity
              style={[styles.stateRetryButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                fetchContent(selectedGenre, true);
                if (trendingToday.length === 0) {
                  getTrendingToday('all', 1, { priority: 'high', forceRefresh: true })
                    .then((res) => res && setTrendingToday(res.slice(0, 10)))
                    .catch(() => null);
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="refresh" size={16} color={colors.onPrimary} />
              <Text style={[styles.stateRetryText, { color: colors.onPrimary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !(contentLoading && !rawContent) && (
          <>
            {/* TIER 0: Immediate Mount (First shelf below hero) */}
            {tier0Sections.map((item) => (
              <ExploreSectionItem
                key={item.key}
                item={item}
                toggleWatchlist={handleToggleWatchlist}
                onExploreAll={handleExploreAll}
              />
            ))}

            {/* TIER 1: Post-Transition Mount (~200ms) */}
            {renderStage >= 1 &&
              tier1Sections.map((item) => (
                <ExploreSectionItem
                  key={item.key}
                  item={item}
                  toggleWatchlist={handleToggleWatchlist}
                  onExploreAll={handleExploreAll}
                />
              ))}

            {/* TIER 2: Lead shelves (~500ms or on early scroll) */}
            {renderStage >= 2 &&
              tier2LeadSections.map((item) => (
                <ExploreSectionItem
                  key={item.key}
                  item={item}
                  toggleWatchlist={handleToggleWatchlist}
                  onExploreAll={handleExploreAll}
                />
              ))}

            {/* TIER 3: Late shelves (~850ms or on early scroll) */}
            {renderStage >= 3 &&
              tier2LateSections.map((item) => (
                <ExploreSectionItem
                  key={item.key}
                  item={item}
                  toggleWatchlist={handleToggleWatchlist}
                  onExploreAll={handleExploreAll}
                />
              ))}
          </>
        )}

        <View style={styles.feedEndSpacer} />
      </Animated.ScrollView>

      {/* Jetpack Compose LoadingIndicator in the Middle of the Screen when Genre / Content is Loading */}
      {!isExpanded && contentLoading && (
        <View style={styles.centerLoadingOverlay} pointerEvents="box-none">
          <View style={[styles.centerLoadingCard, { backgroundColor: colors.surfaceContainer }]}>
            <SharedLoadingIndicator size={36} color={colors.primary} />
          </View>
        </View>
      )}

      {/* Micro-rendered Search Controller (Isolated state, zero feed re-renders while typing) */}
      <ExploreSearchController
        isExpanded={isExpanded}
        onOpen={handleOpenSearch}
        onClose={handleCloseSearch}
        animatedBgStyle={animatedBgStyle}
        animatedSearchStyle={animatedSearchStyle}
        animatedHeaderStyle={animatedHeaderStyle}
        toggleWatchlist={handleToggleWatchlist}
        isSearchFocusedShared={isSearchFocusedShared}
        inSearchModeShared={inSearchModeShared}
        trendingItems={searchTrendingItems}
        personalizedItems={searchPersonalizedItems}
      />
    </View>
  );
};

export default ExplorePage;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0B',
    overflow: 'hidden',
  },
  feed: {
    flex: 1,
  },
  feedEndSpacer: {
    height: 40,
  },
  scrollContent: {
    paddingTop: (StatusBar.currentHeight || 0) + 70,
    paddingBottom: 80,
  },
  headerContainer: {
    width: '100%',
  },
  headerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  searchBarContainer: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingTop: (StatusBar.currentHeight || 0) + 4,
    paddingBottom: 12,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    ...shadows.md,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    height: 48,
    fontSize: 15.5,
    paddingLeft: 4,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  searchIconContainer: {
    paddingLeft: 14,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    paddingRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  centerLoadingCard: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
  stateErrorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 56,
    gap: 10,
  },
  stateErrorTitle: {
    fontSize: 18,
    fontFamily: 'GoogleSansFlex-Bold',
    textAlign: 'center',
    marginTop: 4,
  },
  stateErrorMessage: {
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  stateRetryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 24,
  },
  stateRetryText: {
    fontSize: 15,
    fontFamily: 'GoogleSansFlex-SemiBold',
  },
});