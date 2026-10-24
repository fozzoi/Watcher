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
  StyleSheet,
  RefreshControl,
  StatusBar,
  ScrollView,
  TouchableOpacity,
  BackHandler,
  Keyboard,
  TextInput,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';

import { toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
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
  saveExploreContentCacheSync,
} from '../../src/database';
import {
  getForYouShelvesSync,
  subscribeToForYouShelves,
  refreshForYouShelvesIfNeeded,
  ForYouShelf,
  isMediaReleased,
} from '../../src/services/tasteProfile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, PullToRefreshBox } from '@expo/ui/jetpack-compose';
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB,
  searchPeople,
  searchCollections,
  getTrendingToday,
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
import { HORIZONTAL_MARGIN, GENRE_DATA } from '../../src/components/explore/ExploreConstants';
import { LinearGradient } from 'expo-linear-gradient';

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

const SkeletonCarousel = memo(() => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonTitle} />
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingLeft: HORIZONTAL_MARGIN }}
    >
      {[1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </ScrollView>
  </View>
));

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
  onOpenSearch?: () => void;
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
          <View style={{ marginTop: 20 }}>
            <SkeletonCarousel />
            <SkeletonCarousel />
          </View>
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
  }: ExploreSearchControllerProps) => {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [tmdbResults, setTmdbResults] = useState<any[]>([]);
    const [peopleResults, setPeopleResults] = useState<any[]>([]);
    const searchTimeout = useRef<any>(null);

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
      if (!trimmed) {
        setTmdbResults([]);
        setPeopleResults([]);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);

      try {
        const [movies, people, collections] = await Promise.all([
          searchTMDB(trimmed),
          searchPeople(trimmed),
          searchCollections(trimmed),
        ]);

        const validMovies = movies.filter((item: any) => item.poster_path);
        const validCollections = collections.filter((item: any) => item.poster_path);

        setTmdbResults([...validCollections, ...validMovies]);
        setPeopleResults(people.filter((item: any) => item.profile_path));
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setSearchLoading(false);
      }
    }, []);

    useEffect(() => {
      const inSearch = query.trim() !== '';
      inSearchModeShared.value = inSearch;
      if (!query.trim()) {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        setTmdbResults((prev) => (prev.length > 0 ? [] : prev));
        setPeopleResults((prev) => (prev.length > 0 ? [] : prev));
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

    return (
      <>
        {/* Interactive Search Overlay */}
        {isExpanded && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { zIndex: 10, backgroundColor: '#0A0A0B' },
              animatedBgStyle,
            ]}
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
              />
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
          <LinearGradient
            colors={['rgba(10, 10, 11, 0.95)', 'rgba(10, 10, 11, 0.6)', 'transparent']}
            style={styles.gradientHeader}
            pointerEvents="none"
          />
          <Animated.View
            style={[styles.searchBarContainer, animatedHeaderStyle]}
            pointerEvents="box-none"
          >
            <View style={styles.searchRow}>
              <Animated.View style={[styles.searchInputContainer, animatedSearchStyle]}>
                <View style={styles.searchIconContainer}>
                  <Ionicons name="search" size={20} color="#FFFFFF" />
                </View>
                <TextInput
                  placeholder="Discover..."
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => {
                    isSearchFocusedShared.value = true;
                    onOpen();
                  }}
                  onSubmitEditing={() => saveSearchToHistory(query)}
                  style={styles.searchInput}
                  selectionColor="#E50914"
                  returnKeyType="search"
                  keyboardAppearance="dark"
                  underlineColorAndroid="transparent"
                  cursorColor="#E50914"
                />
                {searchLoading ? (
                  <View style={styles.actionIcon}>
                    <ActivityIndicator color="#E50914" size={18} />
                  </View>
                ) : isExpanded ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleClose}
                    style={styles.actionIcon}
                  >
                    <MaterialIcons name="close" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => router.push('/settings')}
                    style={styles.actionIcon}
                  >
                    <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
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
    prev.isExpanded === next.isExpanded
);

/* =========================================================================
   EXPLORE PAGE ROOT
   ========================================================================= */

const ExplorePage = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedGenre, setSelectedGenre] = useState(0);

  const [rawContent, setRawContent] = useState<any>(() => getExploreContentCacheSync(0));
  const [contentLoading, setContentLoading] = useState<boolean>(() => !getExploreContentCacheSync(0));
  const [refreshing, setRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [trendingToday, setTrendingToday] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const today = await getTrendingToday('all', 1);
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

  // Progressive Staging: Tier 0 (Immediate Launch) -> Tier 1 (Post-transition) -> Tier 2 (On Scroll)
  const [renderStage, setRenderStage] = useState<0 | 1>(0);
  const [hasScrolledPastFold, setHasScrolledPastFold] = useState(false);
  const hasScrolledShared = useSharedValue(false);

  useEffect(() => {
    // Stage 1: Mount Tier 1 once transition lands
    const cancel = runAfterTransition(() => {
      setRenderStage(1);
    }, 250);
    return () => cancel();
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

  const bgOpacity = useSharedValue(0);
  const searchWidthAnim = useSharedValue(0);
  const searchBarTranslateY = useSharedValue(0);
  const isBarHidden = useSharedValue(false);
  const isHeroOutShared = useSharedValue(false);
  const lastScrollY = useSharedValue(0);
  const isSearchFocusedShared = useSharedValue(false);
  const inSearchModeShared = useSharedValue(false);

  useEffect(() => {
    if (isExpanded) {
      searchBarTranslateY.value = withTiming(0, { duration: 150 });
      DeviceEventEmitter.emit('exploreScroll', 0);
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
      try {
        const prefs = await getUserPreferences();
        const content = await fetchPersonalisedDiscoveryContent(
          prefs.languages,
          prefs.genreIds,
          genreId,
          forceRefresh,
          prefs.favoriteActors
        );
        if (requestId !== contentRequestRef.current) return;
        if (content) {
          setRawContent(content);
          saveExploreContentCacheSync(genreId, content);
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
          feedOpacityAnim.value = withTiming(1, { duration: 200 });
        }
      } finally {
        if (requestId === contentRequestRef.current) setContentLoading(false);
      }
    },
    [feedOpacityAnim]
  );

  const handleSelectGenre = useCallback(
    (genreId: number) => {
      if (genreId === selectedGenre) return;
      setSelectedGenre(genreId);
      hasScrolledShared.value = false;
      setHasScrolledPastFold(false);
      setRenderStage(0);

      const cancel = runAfterTransition(() => {
        setRenderStage(1);
      }, 200);

      const cached = getExploreContentCacheSync(genreId);
      if (cached) {
        feedOpacityAnim.value = 0.35;
        setRawContent(cached);
        setContentLoading(false);
        feedOpacityAnim.value = withTiming(1, { duration: 220 });
      } else {
        feedOpacityAnim.value = withTiming(0.45, { duration: 180 });
        setContentLoading(true);
      }
      return () => cancel();
    },
    [selectedGenre, feedOpacityAnim]
  );

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('exploreScroll', 0);
      searchBarTranslateY.value = withTiming(0, { duration: 150 });
      isBarHidden.value = false;
      syncSavedStore();
      getUserPreferences().then((prefs) => {
        const actorsKey = (prefs.favoriteActors || []).map((a: any) => a.id).join(',');
        const currentHash = `${(prefs.languages || []).join(',')}-${(prefs.genreIds || []).join(',')}-${actorsKey}`;
        if (lastPrefsRef.current && lastPrefsRef.current !== currentHash) {
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
    setRefreshing(true);
    hasScrolledShared.value = false;
    setHasScrolledPastFold(false);
    setRenderStage(0);
    try {
      await Promise.all([
        fetchContent(selectedGenre, true),
        refreshForYouShelvesIfNeeded(true),
        getTrendingToday('all', 1).then((res) => res && setTrendingToday(res.slice(0, 10))).catch(() => null),
      ]);
      runAfterTransition(() => {
        setRenderStage(1);
      }, 200);
    } finally {
      setRefreshing(false);
    }
  }, [selectedGenre, fetchContent]);

  // =========================================================================
  // CURATED EDITORIAL HIERARCHY
  // =========================================================================
  const exploreSections = useMemo(() => {
    if (!rawContent) return [];
    const sections: ExploreSection[] = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const selectedGenreObj = GENRE_DATA.find((g) => g.id === selectedGenre);
    const selectedGenreName = selectedGenreObj && selectedGenreObj.id !== 0 ? selectedGenreObj.name : null;

    // 1. Top 10 Today (Ranked Rail with Outlined Numerals)
    if (rawContent.trendingMovies?.length) {
      sections.push({
        key: 'top-10-ranked',
        title: 'Top 10 Today',
        type: 'ranked',
        layout: 'ranked',
        data: rawContent.trendingMovies.slice(0, 10),
      });
    }

    // 2. Personalized Franchise Spotlight (16:9 Landscape Rail)
    if (selectedGenre === 0 && forYouShelves.length > 0) {
      const topShelf = forYouShelves[0];
      const validItems = (topShelf.items || []).filter((item: any) => isMediaReleased(item, todayStr)).slice(0, 10);
      if (validItems.length > 0) {
        sections.push({
          key: `spotlight-${topShelf.shelfId}`,
          title: topShelf.title,
          type: 'spotlight',
          layout: 'spotlight',
          eyebrow: 'CONTINUE THE SAGA',
          data: validItems,
        });
      }
    } else if (rawContent.heroMovies?.length) {
      sections.push({
        key: 'spotlight-featured',
        title: 'Featured Spotlight',
        type: 'spotlight',
        layout: 'spotlight',
        eyebrow: 'MUST WATCH',
        data: rawContent.heroMovies.slice(0, 10),
      });
    }

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

    // 6. Personalized "Because You Watched"
    if (selectedGenre === 0 && becauseYouWatched.length > 0) {
      const primaryRec = becauseYouWatched[0];
      if (primaryRec?.items?.length) {
        sections.push({
          key: 'byw-primary',
          title: `Because You Watched ${primaryRec.sourceTitle}`,
          type: 'becauseyouwatched',
          layout: 'standard',
          data: primaryRec.items.slice(0, 15),
        });
      }
    }

    // 7. Secondary Taste Profile Collection ("Your Sweet Spot")
    if (selectedGenre === 0 && forYouShelves.length > 1) {
      const secondaryShelf = forYouShelves[1];
      const items = (secondaryShelf.items || []).filter((item: any) => isMediaReleased(item, todayStr)).slice(0, 15);
      if (items.length > 0) {
        sections.push({
          key: `foryou-${secondaryShelf.shelfId}`,
          title: secondaryShelf.title,
          type: `foryou-${secondaryShelf.shelfId}`,
          layout: 'standard',
          eyebrow: secondaryShelf.subtitle || undefined,
          data: items,
        });
      }
    }

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
  }, [rawContent, forYouShelves, becauseYouWatched, selectedGenre]);

  // Tier slicing (matching Detail Page progressive mount pattern)
  const tier0Sections = useMemo(() => exploreSections.slice(0, 1), [exploreSections]);
  const tier1Sections = useMemo(() => exploreSections.slice(1, 4), [exploreSections]);
  const tier2Sections = useMemo(() => exploreSections.slice(4), [exploreSections]);

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

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const currentY = event.contentOffset.y;
      const diff = currentY - lastScrollY.value;
      lastScrollY.value = currentY;

      // Tab bar shrink sync (0.8 scale on scroll down, restore on scroll up / top)
      runOnJS(emitExploreScroll)(currentY);

      // Pause hero autoplay and animations when scrolled completely off-screen (> 450px)
      const isHeroOut = currentY > 450;
      if (isHeroOut !== isHeroOutShared.value) {
        isHeroOutShared.value = isHeroOut;
        runOnJS(updateHeroScrollOut)(isHeroOut);
      }

      // Unlock Tier 2 shelves once scrolled past hero/fold
      if (currentY > 120 && !hasScrolledShared.value) {
        hasScrolledShared.value = true;
        runOnJS(setHasScrolledPastFold)(true);
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

  const ExploreRefreshWrapper = ({ children }: { children: React.ReactNode }) => {
    if (Platform.OS === 'android') {
      return (
        <Host seedColor="#8E24AA" colorScheme="dark" style={{ flex: 1, paddingTop: insets.top }}>
          <PullToRefreshBox
            isRefreshing={refreshing}
            onRefresh={onRefresh}
            indicator={{ color: "#8E24AA" }}
          >
            {children}
          </PullToRefreshBox>
        </Host>
      );
    }
    return <>{children}</>;
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Main Smooth ScrollView with Progressive Tier Mounts (Matched with Detail Page) */}
      <ExploreRefreshWrapper>
        <Animated.ScrollView
          style={[{ flex: 1 }, animatedFeedStyle as any]}
          contentContainerStyle={styles.scrollContent}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          refreshControl={
            Platform.OS !== 'android' ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />
            ) : undefined
          }
        >
          <ExploreHeader
            contentLoading={contentLoading}
            rawContent={rawContent}
            heroItems={trendingToday.length ? trendingToday : undefined}
            selectedGenre={selectedGenre}
            onSelectGenre={handleSelectGenre}
            toggleWatchlist={handleToggleWatchlist}
            onOpenSearch={handleOpenSearch}
          />

        {!(contentLoading && !rawContent) && (
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

            {/* TIER 1: Post-Transition Mount (250ms via runAfterTransition) */}
            {(renderStage >= 1 || hasScrolledPastFold) &&
              tier1Sections.map((item) => (
                <ExploreSectionItem
                  key={item.key}
                  item={item}
                  toggleWatchlist={handleToggleWatchlist}
                  onExploreAll={handleExploreAll}
                />
              ))}

            {/* TIER 2: Anchored to Scroll Past Fold */}
            {hasScrolledPastFold &&
              tier2Sections.map((item) => (
                <ExploreSectionItem
                  key={item.key}
                  item={item}
                  toggleWatchlist={handleToggleWatchlist}
                  onExploreAll={handleExploreAll}
                />
              ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
      </ExploreRefreshWrapper>

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
  scrollContent: {
    paddingTop: (StatusBar.currentHeight || 0) + 70,
    paddingBottom: 110,
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
  gradientHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: (StatusBar.currentHeight || 0) + 80,
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
    backgroundColor: '#18181C',
    borderWidth: 1,
    borderColor: '#24242A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'transparent',
    height: 48,
    fontSize: 15.5,
    color: '#FFFFFF',
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
  skeletonContainer: {
    marginBottom: 24,
    paddingLeft: HORIZONTAL_MARGIN,
  },
  skeletonTitle: {
    width: 140,
    height: 20,
    backgroundColor: '#222',
    borderRadius: 4,
    marginBottom: 12,
  },
  skeletonCard: {
    width: 130,
    height: 195,
    backgroundColor: '#222',
    borderRadius: 8,
    marginRight: 12,
  },
});