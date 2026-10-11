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
} from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { useSelector } from '@legendapp/state/react';
import { savedStore$, toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useAnimatedScrollHandler,
  runOnJS,
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
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB,
  searchPeople,
  searchCollections,
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
import { HORIZONTAL_MARGIN, HERO_HEIGHT, GENRE_DATA } from '../../src/components/explore/ExploreConstants';
import { LinearGradient } from 'expo-linear-gradient';

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

const ExplorePage = () => {
  const [selectedGenre, setSelectedGenre] = useState(0);

  const [rawContent, setRawContent] = useState<any>(() => getExploreContentCacheSync(0));
  const [contentLoading, setContentLoading] = useState<boolean>(() => !getExploreContentCacheSync(0));
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [peopleResults, setPeopleResults] = useState<any[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);
  const [forYouShelves, setForYouShelves] = useState<ForYouShelf[]>(() => getForYouShelvesSync());

  // Shelf windowing state: mount 5 shelves initially, stream in 3 on scroll
  const INITIAL_SHELVES = 5;
  const [visibleShelfCount, setVisibleShelfCount] = useState(INITIAL_SHELVES);

  useEffect(() => {
    setVisibleShelfCount(INITIAL_SHELVES);
  }, [selectedGenre]);

  const savedIds = useSelector(() => savedStore$.savedIds.get());
  const feedOpacityAnim = useSharedValue(1);

  useEffect(() => {
    const unsubscribe = subscribeToForYouShelves((updatedShelves) => {
      setForYouShelves(updatedShelves);
    });
    refreshForYouShelvesIfNeeded();
    return () => unsubscribe();
  }, []);

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

  const router = useRouter();
  const searchTimeout = useRef<any>(null);
  const contentRequestRef = useRef(0);

  const inSearchMode = query.trim() !== '';
  const isExpanded = isSearchFocused || inSearchMode;

  const bgOpacity = useSharedValue(0);
  const searchWidthAnim = useSharedValue(0);
  const searchBarTranslateY = useSharedValue(0);
  const lastOffsetY = useSharedValue(0);
  const wasPastHero = useSharedValue(false);
  const isSearchFocusedShared = useSharedValue(false);
  const inSearchModeShared = useSharedValue(false);

  useEffect(() => {
    isSearchFocusedShared.value = isSearchFocused;
  }, [isSearchFocused]);

  useEffect(() => {
    inSearchModeShared.value = inSearchMode;
  }, [inSearchMode]);

  useEffect(() => {
    if (isExpanded) {
      searchBarTranslateY.value = withTiming(0, { duration: 150 });
    }
  }, [isExpanded]);

  const updateHeroScroll = useCallback((isPastHero: boolean) => {
    if (isPastHero !== heroScroll$.isScrolledOut.peek()) {
      heroScroll$.isScrolledOut.set(isPastHero);
    }
  }, []);

  useEffect(() => {
    bgOpacity.value = withTiming(isExpanded ? 1 : 0, { duration: 180 });
  }, [isExpanded]);

  useEffect(() => {
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

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (queryRef.current.trim() !== '' || isSearchFocused) {
          Keyboard.dismiss();
          setQuery('');
          setIsSearchFocused(false);
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isSearchFocused])
  );

  const lastPrefsRef = useRef<string>('');

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

        setTimeout(() => {
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
        }, 150);
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
    },
    [selectedGenre, feedOpacityAnim]
  );

  useFocusEffect(
    useCallback(() => {
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
    try {
      await Promise.all([
        fetchContent(selectedGenre, true),
        refreshForYouShelvesIfNeeded(true),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [selectedGenre, fetchContent]);

  // =========================================================================
  // CURATED EDITORIAL HIERARCHY
  // - Replaces repetitive genre carousels with top chips
  // - Elevates TV Series discovery earlier in the feed
  // - Showcases a single featured actor row instead of stacking multiple
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
      const validItems = (topShelf.items || []).filter((item: any) => isMediaReleased(item, todayStr));
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
        data: rawContent.heroMovies,
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
        data: rawContent.trendingTV,
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
          data: featuredActor.items,
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
          data: primaryRec.items,
        });
      }
    }

    // 7. Secondary Taste Profile Collection ("Your Sweet Spot")
    if (selectedGenre === 0 && forYouShelves.length > 1) {
      const secondaryShelf = forYouShelves[1];
      const items = (secondaryShelf.items || []).filter((item: any) => isMediaReleased(item, todayStr));
      if (items.length > 0) {
        sections.push({
          key: `foryou-${secondaryShelf.shelfId}`,
          title: secondaryShelf.title,
          type: `foryou-${secondaryShelf.shelfId}`,
          layout: 'standard',
          data: items,
        });
      }
    }

    // 8. Hidden Gems (Cult & Indie Discoveries)
    if (rawContent.hiddenGems?.length) {
      sections.push({
        key: 'hidden-gems',
        title: selectedGenreName ? `Hidden ${selectedGenreName} Gems` : 'Hidden Gems',
        type: 'hiddengems',
        layout: 'standard',
        data: rawContent.hiddenGems,
      });
    }

    // 9. All-Time Masterpieces / Top Rated
    if (rawContent.topRated?.length) {
      sections.push({
        key: 'top-rated',
        title: selectedGenreName ? `Top Rated ${selectedGenreName}` : 'All-Time Masterpieces',
        type: 'toprated',
        layout: 'standard',
        data: rawContent.topRated,
      });
    }

    // 10. Nostalgic Hits
    if (rawContent.nostalgia?.length) {
      sections.push({
        key: 'nostalgia',
        title: 'Nostalgic Hits',
        type: 'nostalgia',
        layout: 'standard',
        data: rawContent.nostalgia,
      });
    }

    // 11. Animated Favorites
    if (rawContent.animatedMovies?.length) {
      sections.push({
        key: 'animated-movies',
        title: 'Animated Favorites',
        type: 'animatedmovies',
        layout: 'standard',
        data: rawContent.animatedMovies,
      });
    }

    // 12. Coming Soon to Theaters
    if (rawContent.upcoming?.length) {
      sections.push({
        key: 'upcoming',
        title: 'Coming Soon to Theaters',
        type: 'upcoming',
        layout: 'standard',
        data: rawContent.upcoming,
      });
    }

    return sections;
  }, [rawContent, forYouShelves, becauseYouWatched, selectedGenre]);

  const paginatedSections = useMemo(
    () => exploreSections.slice(0, visibleShelfCount),
    [exploreSections, visibleShelfCount]
  );

  const loadMoreShelves = useCallback(() => {
    setVisibleShelfCount((prev) => Math.min(prev + 3, exploreSections.length));
  }, [exploreSections.length]);

  const renderExploreHeader = useCallback(() => {
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
          items={rawContent?.heroMovies || rawContent?.trendingMovies || []}
          toggleWatchlist={handleToggleWatchlist}
        />
        <GenreFilter selectedGenre={selectedGenre} onSelectGenre={handleSelectGenre} />
      </View>
    );
  }, [contentLoading, rawContent, handleToggleWatchlist, selectedGenre, handleSelectGenre]);

  const renderExploreSection = useCallback(
    ({ item }: { item: ExploreSection }) => {
      switch (item.layout) {
        case 'ranked':
          return (
            <RankedTop10Carousel
              data={item.data}
              savedIds={savedIds}
              toggleWatchlist={handleToggleWatchlist}
            />
          );
        case 'spotlight':
          return (
            <SpotlightCarousel
              title={item.title}
              eyebrow={item.eyebrow}
              data={item.data}
              onExploreAll={() => {
                router.push({
                  pathname: '/viewall',
                  params: {
                    title: item.title,
                    type: 'foryou-saga-all',
                  },
                });
              }}
            />
          );
        case 'world_hub':
          return (
            <WorldCinemaHub
              langData={item.data}
              savedIds={savedIds}
              toggleWatchlist={handleToggleWatchlist}
            />
          );
        case 'standard':
        default:
          return (
            <MediaCarousel
              title={item.title}
              type={item.type}
              data={item.data}
              savedIds={savedIds}
              toggleWatchlist={handleToggleWatchlist}
            />
          );
      }
    },
    [handleToggleWatchlist, savedIds]
  );

  const renderFooter = useCallback(() => <View style={{ height: 40 }} />, []);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const currentOffset = event.contentOffset.y;
      const diff = currentOffset - lastOffsetY.value;
      lastOffsetY.value = currentOffset;

      const isPastHero = currentOffset > HERO_HEIGHT * 0.85;
      if (isPastHero !== wasPastHero.value) {
        wasPastHero.value = isPastHero;
        runOnJS(updateHeroScroll)(isPastHero);
      }

      if (currentOffset <= 0) {
        searchBarTranslateY.value = withTiming(0, { duration: 150 });
      } else if (
        diff > 25 &&
        searchBarTranslateY.value === 0 &&
        !isSearchFocusedShared.value &&
        !inSearchModeShared.value
      ) {
        searchBarTranslateY.value = withTiming(-100, { duration: 180 });
      } else if (diff < -25 && searchBarTranslateY.value < 0) {
        searchBarTranslateY.value = withTiming(0, { duration: 180 });
      }
    },
  });

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

  useEffect(() => {
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
  }, [query, handleSearch]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Main virtualized feed */}
      <AnimatedLegendList
        style={[{ flex: 1 }, animatedFeedStyle as any]}
        data={contentLoading && !rawContent ? [] : paginatedSections}
        renderItem={renderExploreSection}
        keyExtractor={(item) => item.key}
        recycleItems={false}
        estimatedItemSize={320}
        drawDistance={500}
        onEndReached={loadMoreShelves}
        onEndReachedThreshold={0.5}
        decelerationRate="normal"
        ListHeaderComponent={renderExploreHeader}
        ListFooterComponent={renderFooter}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />
        }
      />

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
              savedIds={savedIds}
              toggleWatchlist={handleToggleWatchlist}
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
                onFocus={() => setIsSearchFocused(true)}
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
                  onPress={() => {
                    Keyboard.dismiss();
                    setQuery('');
                    setIsSearchFocused(false);
                  }}
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