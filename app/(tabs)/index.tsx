import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
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
  NativeSyntheticEvent,
  NativeScrollEvent,
  Dimensions,
  InteractionManager,
} from 'react-native';
import { LegendList } from '@legendapp/list/react-native';
import { useSelector } from '@legendapp/state/react';
import { savedStore$, toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSavedItems, addSavedItem, removeSavedItem, hasSavedItem } from '../../src/database';
import {
  getForYouShelvesSync,
  subscribeToForYouShelves,
  refreshForYouShelvesIfNeeded,
  ForYouShelf,
  logTasteEvent,
  TASTE_WEIGHTS,
  isMediaReleased,
} from '../../src/services/tasteProfile';
import {
  fetchPersonalisedDiscoveryContent,
  getSimilarForHistory,
  searchTMDB,
  searchPeople,
  searchCollections,
} from '../../src/tmdb';
import { getUserPreferences, LANGUAGE_OPTIONS } from '../../src/userPreferences';

// --- COMPONENTS ---
import SkeletonHero from '../../src/components/explore/SkeletonHero';
import HeroSection from '../../src/components/explore/HeroSection';
import GenreFilter from '../../src/components/explore/GenreFilter';
import MediaCarousel from '../../src/components/shared/MediaCarousel';
import SearchResultsList from '../../src/components/search/SearchResultsList';
import { HORIZONTAL_MARGIN } from '../../src/components/explore/ExploreConstants';
import { LinearGradient } from 'expo-linear-gradient';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SkeletonCarousel = () => (
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
);

const filterWatched = (list: any[], wIds: Set<number>) => {
  if (!list || !Array.isArray(list)) return [];
  return list.filter(
    (item: any) =>
      Boolean(item && item.id && (item.poster_path || item.backdrop_path) && !wIds.has(item.id))
  );
};

type ExploreSection = { key: string; title: string; type: string; data: any[] };

const PAGE_SIZE = 6;

const ExplorePage = () => {
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const savedIds = useSelector(() => savedStore$.savedIds.get());
  const watchedIds = useSelector(() => savedStore$.watchedIds.get());

  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [peopleResults, setPeopleResults] = useState<any[]>([]);

  const [rawContent, setRawContent] = useState<any>(null);
  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);

  // Instant <5ms synchronous read from SQLite for_you_cache
  const [forYouShelves, setForYouShelves] = useState<ForYouShelf[]>(() => {
    return getForYouShelvesSync();
  });

  useEffect(() => {
    const unsubscribe = subscribeToForYouShelves((updatedShelves) => {
      setForYouShelves(updatedShelves);
    });
    // Silent idle background refresh if stale (> 12h) or empty
    refreshForYouShelvesIfNeeded();
    return () => unsubscribe();
  }, []);

  // Pagination states
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  const router = useRouter();
  const searchTimeout = useRef<any>(null);
  const contentRequestRef = useRef(0);

  const inSearchMode = query.trim() !== '';
  const isExpanded = isSearchFocused || inSearchMode;

  const bgOpacity = useSharedValue(0);
  const searchWidthAnim = useSharedValue(0);
  const searchBarTranslateY = useSharedValue(0);
  const lastOffsetY = useRef(0);

  useEffect(() => {
    bgOpacity.value = withTiming(inSearchMode ? 1 : 0, { duration: 250 });
  }, [inSearchMode]);

  useEffect(() => {
    searchWidthAnim.value = withTiming(isExpanded ? 1 : 0, { duration: 250 });
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

  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (queryRef.current.trim() !== '') {
          Keyboard.dismiss();
          setQuery('');
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  const lastPrefsRef = useRef<string>('');

  const fetchContent = useCallback(async (genreId: number = 0, forceRefresh: boolean = false) => {
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
        setVisibleCount(PAGE_SIZE);
      }

      const history = getSavedItems('history');
      if (history && history.length > 0) {
        const similar = await getSimilarForHistory(history);
        if (requestId === contentRequestRef.current) setBecauseYouWatched(similar);
      } else if (requestId === contentRequestRef.current) {
        setBecauseYouWatched([]);
      }
    } catch (err) {
      if (requestId === contentRequestRef.current) console.error(err);
    } finally {
      if (requestId === contentRequestRef.current) setContentLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        syncSavedStore();
        getUserPreferences().then((prefs) => {
          const actorsKey = (prefs.favoriteActors || []).map((a: any) => a.id).join(',');
          const currentHash = `${(prefs.languages || []).join(',')}-${(prefs.genreIds || []).join(',')}-${actorsKey}`;
          if (lastPrefsRef.current && lastPrefsRef.current !== currentHash) {
            fetchContent(selectedGenre, true);
          }
          lastPrefsRef.current = currentHash;
        });
      });
      return () => {
        task.cancel();
      };
    }, [fetchContent, selectedGenre])
  );

  const toggleWatchlist = useCallback((item: any) => {
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

  const allContent = useMemo(() => {
    if (!rawContent) {
      return {
        trendingMovies: [],
        trendingTV: [],
        topRated: [],
        upcoming: [],
        hiddenGems: [],
        langData: {},
        actorData: [],
        genreData: [],
      };
    }

    const filteredContent: any = {
      trendingMovies: filterWatched(rawContent.trendingMovies, watchedIds),
      trendingTV: filterWatched(rawContent.trendingTV, watchedIds),
      topRated: filterWatched(rawContent.topRated, watchedIds),
      upcoming: filterWatched(rawContent.upcoming, watchedIds),
      hiddenGems: filterWatched(rawContent.hiddenGems, watchedIds),
      langData: {} as Record<string, any>,
      actorData: (rawContent.actorData || [])
        .map((a: any) => ({
          ...a,
          items: filterWatched(a.items, watchedIds),
        }))
        .filter((a: any) => a.items.length > 0),
      genreData: (rawContent.genreData || [])
        .map((g: any) => ({
          ...g,
          items: filterWatched(g.items, watchedIds),
        }))
        .filter((g: any) => g.items.length > 0),
    };

    if (rawContent.langData) {
      Object.keys(rawContent.langData).forEach((lang) => {
        filteredContent.langData[lang] = {
          movies: filterWatched(rawContent.langData[lang].movies, watchedIds),
          tv: filterWatched(rawContent.langData[lang].tv, watchedIds),
        };
      });
    }

    return filteredContent;
  }, [rawContent, watchedIds]);

  const filteredBecauseYouWatched = useMemo(
    () =>
      becauseYouWatched
        .map((row, index) => ({
          key: `byw-${index}`,
          title: `Because you watched ${row.sourceTitle}`,
          type: 'becauseyouwatched',
          data: filterWatched(row.items, watchedIds),
        }))
        .filter((section) => section.data.length > 0),
    [becauseYouWatched, watchedIds]
  );

  const filteredForYouSections = useMemo(
    () => {
      const todayStr = new Date().toISOString().split('T')[0];
      return forYouShelves
        .map((shelf) => ({
          key: `foryou-${shelf.shelfId}`,
          title: shelf.title,
          type: `foryou-${shelf.shelfId}`,
          data: filterWatched(shelf.items, watchedIds).filter((item: any) => isMediaReleased(item, todayStr)),
        }))
        .filter((section) => section.data.length > 0);
    },
    [forYouShelves, watchedIds]
  );

  const exploreSections = useMemo(() => {
    const sections: ExploreSection[] = [];

    const sagaShelves = filteredForYouSections.filter((s) => s.key.startsWith('foryou-saga'));
    const otherForYouShelves = filteredForYouSections.filter((s) => !s.key.startsWith('foryou-saga'));

    // 1. Franchise continuation rails ("Continue The Sagas", plus individual franchise spotlights)
    sagaShelves.forEach((shelf) => sections.push(shelf));

    // 2. Trending Movies
    sections.push({ key: 'trending-movies', title: 'Trending Movies', type: 'trendingmovies', data: allContent.trendingMovies });

    // 3. Personalized For You rails ("Your Sweet Spot", "Because You Follow [Person]", "Top Picks For You")
    otherForYouShelves.forEach((shelf) => sections.push(shelf));

    // 4. Curated explore rails
    sections.push(
      { key: 'upcoming', title: 'Coming Soon', type: 'upcoming', data: allContent.upcoming },
      { key: 'trending-tv', title: 'Trending TV Shows', type: 'trendingtv', data: allContent.trendingTV },
      { key: 'top-rated', title: 'Top Rated Movies', type: 'toprated', data: allContent.topRated },
      { key: 'hidden-gems', title: 'Hidden Gems', type: 'hiddengems', data: allContent.hiddenGems },
    );

    Object.entries(allContent.langData || {}).forEach(([langCode, languageData]: [string, any]) => {
      const language = LANGUAGE_OPTIONS.find((option) => option.code === langCode);
      const languageName = language ? language.label : langCode.toUpperCase();
      if (languageData.movies?.length) {
        sections.push({
          key: `lang-movies-${langCode}`,
          title: `${languageName} Movies`,
          type: `lang-movies-${langCode}`,
          data: languageData.movies,
        });
      }
      if (languageData.tv?.length) {
        sections.push({
          key: `lang-tv-${langCode}`,
          title: `${languageName} TV Shows`,
          type: `lang-tv-${langCode}`,
          data: languageData.tv,
        });
      }
    });

    allContent.actorData.forEach((actor: any) =>
      sections.push({
        key: `actor-${actor.actorId}`,
        title: `Starring ${actor.actorName}`,
        type: `actor-${actor.actorId}`,
        data: actor.items,
      })
    );

    filteredBecauseYouWatched.forEach((section) => sections.push(section));
    return sections.filter((section) => section.data.length > 0);
  }, [allContent, filteredBecauseYouWatched, filteredForYouSections]);

  const paginatedSections = useMemo(() => {
    return exploreSections.slice(0, visibleCount);
  }, [exploreSections, visibleCount]);

  const loadMoreSections = useCallback(() => {
    if (loadingMore || visibleCount >= exploreSections.length) return;
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, exploreSections.length));
      setLoadingMore(false);
    }, 150);
  }, [loadingMore, visibleCount, exploreSections.length]);

  const renderExploreHeader = useCallback(
    () =>
      contentLoading ? (
        <>
          <SkeletonHero />
          <View style={{ marginTop: 24 }}>
            <SkeletonCarousel />
            <SkeletonCarousel />
            <SkeletonCarousel />
          </View>
        </>
      ) : (
        <>
          <HeroSection
            items={allContent.heroMovies || allContent.trendingMovies}
            savedIds={savedIds}
            toggleWatchlist={toggleWatchlist}
          />
          <GenreFilter selectedGenre={selectedGenre} onSelectGenre={setSelectedGenre} />
        </>
      ),
    [contentLoading, allContent, savedIds, toggleWatchlist, selectedGenre]
  );

  const renderExploreSection = useCallback(
    ({ item }: { item: ExploreSection }) => (
      <MediaCarousel
        title={item.title}
        type={item.type}
        data={item.data}
        savedIds={savedIds}
        toggleWatchlist={toggleWatchlist}
      />
    ),
    [savedIds, toggleWatchlist]
  );

  const renderFooter = useCallback(() => {
    if (visibleCount >= exploreSections.length || contentLoading) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#E50914" />
      </View>
    );
  }, [visibleCount, exploreSections.length, contentLoading]);


  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentOffset = event.nativeEvent.contentOffset.y;
      const diff = currentOffset - lastOffsetY.current;
      lastOffsetY.current = currentOffset;

      DeviceEventEmitter.emit('exploreScroll', currentOffset);

      if (currentOffset <= 0) {
        searchBarTranslateY.value = withTiming(0, { duration: 150 });
      } else if (diff > 8 && searchBarTranslateY.value === 0 && !isSearchFocused && !inSearchMode) {
        searchBarTranslateY.value = withTiming(-100, { duration: 250 });
      } else if (diff < -8 && searchBarTranslateY.value < 0) {
        searchBarTranslateY.value = withTiming(0, { duration: 250 });
      }
    },
    [isSearchFocused, inSearchMode, searchBarTranslateY]
  );

  const handleSearch = useCallback(async (searchText: string) => {
    let trimmed = searchText.trim();
    if (!trimmed) {
      setTmdbResults([]);
      setPeopleResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);

    const yearMatch = trimmed.match(/(?:\s+|\()([1-2][0-9]{3})(?:\))?$/);
    if (yearMatch) {
      trimmed = trimmed.replace(yearMatch[0], '').trim();
    }

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
      const currentStr = await AsyncStorage.getItem('searchHistoryExpl');
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      if (!Array.isArray(currentList)) currentList = [];
      currentList = currentList.filter(
        (item: any) => typeof item === 'string' && item.toLowerCase() !== trimmed.toLowerCase()
      );
      currentList.unshift(trimmed);
      if (currentList.length > 15) currentList = currentList.slice(0, 15);
      await AsyncStorage.setItem('searchHistoryExpl', JSON.stringify(currentList));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(query), 400);
    return () => clearTimeout(searchTimeout.current);
  }, [query, handleSearch]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <LegendList
        data={contentLoading ? [] : paginatedSections}
        renderItem={renderExploreSection}
        keyExtractor={(item) => item.key}
        estimatedItemSize={280}
        ListHeaderComponent={renderExploreHeader}
        ListFooterComponent={renderFooter}
        onEndReached={loadMoreSections}
        onEndReachedThreshold={0.5}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
      />

      {inSearchMode && (
        <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10, backgroundColor: '#141414' }, animatedBgStyle]}>
          <SearchResultsList
            peopleResults={peopleResults}
            tmdbResults={tmdbResults}
            savedIds={savedIds}
            toggleWatchlist={toggleWatchlist}
          />
        </Animated.View>
      )}

      <View style={styles.headerWrapper} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(20, 20, 20, 0.95)', 'rgba(20, 20, 20, 0.5)', 'transparent']}
          style={styles.gradientHeader}
          pointerEvents="none"
        />
        <Animated.View style={[styles.searchBarContainer, animatedHeaderStyle]} pointerEvents="box-none">
          <View style={styles.searchRow}>
            <Animated.View style={[styles.searchInputContainer, animatedSearchStyle]}>
              <View style={styles.searchIconContainer}>
                <Ionicons name="search" size={20} color="#FFFFFF" />
              </View>
              <TextInput
                placeholder="Discover..."
                placeholderTextColor="rgba(255, 255, 255, 0.7)"
                value={query}
                onChangeText={setQuery}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
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
              ) : query.length > 0 ? (
                <TouchableOpacity activeOpacity={0.95} onPress={() => setQuery('')} style={styles.actionIcon}>
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
    backgroundColor: '#101010',
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: (StatusBar.currentHeight || 0) + 70,
    paddingBottom: 110,
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontSize: 16,
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});