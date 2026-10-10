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
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { AnimatedLegendList } from '@legendapp/list/reanimated';
import { toggleWatchlistGlobal, syncSavedStore } from '../../src/state/savedState';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
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
import { getUserPreferences, LANGUAGE_OPTIONS, GENRE_OPTIONS } from '../../src/userPreferences';

// --- COMPONENTS ---
import SkeletonHero from '../../src/components/explore/SkeletonHero';
import HeroSection, { heroScroll$ } from '../../src/components/explore/HeroSection';
import GenreFilter from '../../src/components/explore/GenreFilter';
import MediaCarousel from '../../src/components/shared/MediaCarousel';
import SearchResultsList from '../../src/components/search/SearchResultsList';
import SearchEmptyState from '../../src/components/search/SearchEmptyState';
import { HORIZONTAL_MARGIN, GENRE_DATA, HERO_HEIGHT } from '../../src/components/explore/ExploreConstants';
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

type ExploreSection = { key: string; title: string; type: string; data: any[] };

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

  // Smoothing shared value for seamless genre switching without screen tearing
  const feedOpacityAnim = useSharedValue(1);

  useEffect(() => {
    const unsubscribe = subscribeToForYouShelves((updatedShelves) => {
      setForYouShelves(updatedShelves);
    });
    refreshForYouShelvesIfNeeded();
    return () => unsubscribe();
  }, []);

  // Hydrate search history
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
  const lastOffsetY = useRef(0);
  const isHeaderHidden = useRef(false);

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
  }, [feedOpacityAnim]);

  // Smooth Genre Switching: preserves current view, cross-fades gently into new data
  const handleSelectGenre = useCallback(
    (genreId: number) => {
      if (genreId === selectedGenre) return;
      setSelectedGenre(genreId);

      const cached = getExploreContentCacheSync(genreId);
      if (cached) {
        // Instant cached swap with seamless crossfade
        feedOpacityAnim.value = 0.35;
        setRawContent(cached);
        setContentLoading(false);
        feedOpacityAnim.value = withTiming(1, { duration: 220 });
      } else {
        // Retain existing content in background, soft fade while network catches up
        feedOpacityAnim.value = withTiming(0.45, { duration: 180 });
        setContentLoading(true);
        fetchContent(genreId, false);
      }
    },
    [selectedGenre, feedOpacityAnim, fetchContent]
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

  const exploreSections = useMemo(() => {
    if (!rawContent) return [];
    const sections: ExploreSection[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    const selectedGenreObj = GENRE_DATA.find((g) => g.id === selectedGenre);
    const selectedGenreName = selectedGenreObj && selectedGenreObj.id !== 0 ? selectedGenreObj.name : null;

    // --- Collect All Language Rails ---
    const langSections: ExploreSection[] = [];
    if (rawContent.langData) {
      Object.entries(rawContent.langData).forEach(([langCode, languageData]: [string, any]) => {
        const language = LANGUAGE_OPTIONS.find((option) => option.code === langCode);
        const languageName = language ? language.label : langCode.toUpperCase();
        if (languageData.movies?.length) {
          langSections.push({
            key: `lang-movies-${langCode}`,
            title: selectedGenreName ? `${languageName} ${selectedGenreName} Movies` : `${languageName} Movies`,
            type: `lang-movies-${langCode}`,
            data: languageData.movies,
          });
        }
        if (languageData.tv?.length) {
          langSections.push({
            key: `lang-tv-${langCode}`,
            title: selectedGenreName ? `${languageName} ${selectedGenreName} Series` : `${languageName} TV Shows`,
            type: `lang-tv-${langCode}`,
            data: languageData.tv,
          });
        }
      });
    }

    // --- Collect Favorite Actor Rails ---
    const actorSections: ExploreSection[] = [];
    (rawContent.actorData || []).forEach((actor: any) => {
      if (actor.items?.length) {
        actorSections.push({
          key: `actor-${actor.actorId}`,
          title: `Starring ${actor.actorName}`,
          type: `actor-${actor.actorId}`,
          data: actor.items,
        });
      }
    });

    // --- Collect Preferred Genre Rails ---
    const genreSections: ExploreSection[] = [];
    if (selectedGenre === 0 && rawContent.genreData) {
      rawContent.genreData.forEach((g: any) => {
        if (g.items?.length) {
          const genreObj = GENRE_OPTIONS.find((opt) => opt.id === g.genreId);
          const genreName = genreObj ? genreObj.label : 'Popular';
          genreSections.push({
            key: `genre-${g.genreId}`,
            title: `${genreName} Movies`,
            type: `genre/${g.genreId}`,
            data: g.items,
          });
        }
      });
    }

    // =========================================================================
    // SECTION ORDERING HIERARCHY (Curated for maximum engagement & relevance)
    // =========================================================================

    // 1. Personalized "For You" shelves (Franchises, Director/Taste collections)
    if (selectedGenre === 0) {
      forYouShelves.forEach((shelf) => {
        const items = (shelf.items || []).filter((item: any) => isMediaReleased(item, todayStr));
        if (items.length > 0) {
          sections.push({
            key: `foryou-${shelf.shelfId}`,
            title: shelf.title,
            type: `foryou-${shelf.shelfId}`,
            data: items,
          });
        }
      });
    }

    // 2. "Because You Watched" (Continuations from user's recent watches)
    if (selectedGenre === 0) {
      becauseYouWatched.forEach((row, index) => {
        if (row.items?.length) {
          sections.push({
            key: `byw-${index}`,
            title: `Because you watched ${row.sourceTitle}`,
            type: 'becauseyouwatched',
            data: row.items,
          });
        }
      });
    }
    // 15. Coming Soon (Future releases placed cleanly at the end)
    if (rawContent.upcoming?.length) {
      sections.push({ key: 'upcoming', title: 'Coming Soon', type: 'upcoming', data: rawContent.upcoming });
    }
    // 3. Trending Movies
    if (rawContent.trendingMovies?.length) {
      const title = selectedGenreName ? `Popular ${selectedGenreName} Movies` : 'Trending Movies';
      sections.push({ key: 'trending-movies', title, type: 'trendingmovies', data: rawContent.trendingMovies });
    }

    // 4. Trending TV Shows
    if (rawContent.trendingTV?.length) {
      const title = selectedGenreName ? `Popular ${selectedGenreName} Series` : 'Trending Shows';
      sections.push({ key: 'trending-tv', title, type: 'trendingtv', data: rawContent.trendingTV });
    }
    if (rawContent.topRated?.length) {
      const title = selectedGenreName ? `Top Rated ${selectedGenreName}` : 'Top Rated Movies';
      sections.push({ key: 'top-rated', title, type: 'toprated', data: rawContent.topRated });
    }

    // 13. Nostalgic Hits (90s & 2000s Classics)
    if (rawContent.nostalgia?.length) {
      const title = selectedGenreName ? `90s & 2000s ${selectedGenreName}` : 'Nostalgic Hits';
      sections.push({ key: 'nostalgia', title, type: 'nostalgia', data: rawContent.nostalgia });
    }

    // 14. Animated Favorites
    if (rawContent.animatedMovies?.length) {
      const title = selectedGenreName ? `Animated ${selectedGenreName}` : 'Trending Animated';
      sections.push({ key: 'animated-movies', title, type: 'animatedmovies', data: rawContent.animatedMovies });
    }

    // 5. User's Primary Language Content (Top 2 selected languages)
    const primaryLangs = langSections.slice(0, 4);
    primaryLangs.forEach((s) => sections.push(s));

    // 6. Starring Favorite Actor (First Actor)
    if (actorSections[0]) {
      sections.push(actorSections[0]);
    }

    // 7. Preferred Genre (First Chosen Genre)
    if (genreSections[0]) {
      sections.push(genreSections[0]);
    }

    // 8. Secondary Language Content (Next selected languages)
    const secondaryLangs = langSections.slice(4, 8);
    secondaryLangs.forEach((s) => sections.push(s));

    // 9. Hidden Gems (Critically acclaimed, high-scoring gems)
    if (rawContent.hiddenGems?.length) {
      const title = selectedGenreName ? `Hidden ${selectedGenreName} Gems` : 'Hidden Gems';
      sections.push({ key: 'hidden-gems', title, type: 'hiddengems', data: rawContent.hiddenGems });
    }

    // 10. Remaining Favorite Actors & Genres
    actorSections.slice(1).forEach((s) => sections.push(s));
    genreSections.slice(1).forEach((s) => sections.push(s));

    // 11. All Other Language Rails (languages 5+)
    const remainingLangs = langSections.slice(8);
    remainingLangs.forEach((s) => sections.push(s));

    // 12. Top Rated Movies (All-time masterworks)
    

    
    return sections;
  }, [rawContent, forYouShelves, becauseYouWatched, selectedGenre]);

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
    ({ item }: { item: ExploreSection }) => (
      <MediaCarousel
        title={item.title}
        type={item.type}
        data={item.data}
        toggleWatchlist={handleToggleWatchlist}
      />
    ),
    [handleToggleWatchlist]
  );

  const renderFooter = useCallback(() => {
    return <View style={{ height: 40 }} />;
  }, []);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentOffset = event.nativeEvent.contentOffset.y;
      const diff = currentOffset - lastOffsetY.current;
      lastOffsetY.current = currentOffset;

      const isPastHero = currentOffset > HERO_HEIGHT * 0.85;
      if (isPastHero !== heroScroll$.isScrolledOut.peek()) {
        heroScroll$.isScrolledOut.set(isPastHero);
      }

      if (currentOffset <= 0) {
        if (isHeaderHidden.current) {
          searchBarTranslateY.value = withTiming(0, { duration: 150 });
          isHeaderHidden.current = false;
        }
      } else if (diff > 25 && !isHeaderHidden.current && !isSearchFocused && !inSearchMode) {
        searchBarTranslateY.value = withTiming(-100, { duration: 180 });
        isHeaderHidden.current = true;
      } else if (diff < -25 && isHeaderHidden.current) {
        searchBarTranslateY.value = withTiming(0, { duration: 180 });
        isHeaderHidden.current = false;
      }
    },
    [isSearchFocused, inSearchMode, searchBarTranslateY]
  );

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
      const updated = [trimmed, ...recentSearches.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 15);
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
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(query), 320);
    return () => clearTimeout(searchTimeout.current);
  }, [query, handleSearch]);

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Main virtualized feed with smooth cross-fade */}
      <AnimatedLegendList
        style={[{ flex: 1 }, animatedFeedStyle as any]}
        data={contentLoading && !rawContent ? [] : exploreSections}
        renderItem={renderExploreSection}
        keyExtractor={(item) => item.key}
        recycleItems={false}
        estimatedItemSize={150}
        drawDistance={150}
        decelerationRate="normal"
        ListHeaderComponent={renderExploreHeader}
        ListFooterComponent={renderFooter}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => Keyboard.dismiss()}
        onScroll={handleScroll}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
      />

      {/* Interactive Search Overlay */}
      {isExpanded && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { zIndex: 10, backgroundColor: '#101010' },
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
              toggleWatchlist={handleToggleWatchlist}
            />
          )}
        </Animated.View>
      )}

      {/* Persistent App Header */}
      <View style={styles.headerWrapper} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(16, 16, 16, 0.95)', 'rgba(16, 16, 16, 0.6)', 'transparent']}
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
    backgroundColor: '#101010',
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
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#26262A',
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
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});