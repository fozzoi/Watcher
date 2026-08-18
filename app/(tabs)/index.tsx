import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
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
  Alert,
  ActivityIndicator,
  DeviceEventEmitter
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSavedItems, addSavedItem, removeSavedItem, hasSavedItem } from '../../src/database';
import { BlurView, BlurTargetView } from 'expo-blur';
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
import HeroSection from '../../src/components/explore/HeroSection';
import GenreFilter from '../../src/components/explore/GenreFilter';
import MediaCarousel from '../../src/components/shared/MediaCarousel';
import SearchResultsList from '../../src/components/search/SearchResultsList';
import { HORIZONTAL_MARGIN } from '../../src/components/explore/ExploreConstants';
import { LinearGradient } from 'expo-linear-gradient';

const SkeletonCarousel = () => (
  <View style={styles.skeletonContainer}>
    <View style={styles.skeletonTitle} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: HORIZONTAL_MARGIN }}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={styles.skeletonCard} />
      ))}
    </ScrollView>
  </View>
);

const filterWatched = (list: any[], wIds: Set<number>) => {
  if (!list) return [];
  return list.filter((item: any) => !wIds.has(item.id));
};

const ExplorePage = () => {
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set());

  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [peopleResults, setPeopleResults] = useState<any[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const [rawContent, setRawContent] = useState<any>(null);

  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);
  const [allContent, setAllContent] = useState<any>({
    trendingMovies: [], trendingTV: [], topRated: [],
    upcoming: [], hiddenGems: [], langData: {}, actorData: [], genreData: []
  });

  const router = useRouter();
  const searchTimeout = useRef<any>(null);

  const inSearchMode = query.trim() !== '';
  const isExpanded = isSearchFocused || inSearchMode;

  const bgOpacity = useSharedValue(0);
  const searchWidthAnim = useSharedValue(0);
  const searchBarTranslateY = useSharedValue(0);
  const lastOffsetY = useRef(0);
  const scrollIdleTimeout = useRef<any>(null);
  const targetRef = useRef<View | null>(null);

  useEffect(() => {
    bgOpacity.value = withTiming(inSearchMode ? 1 : 0, { duration: 300 });
  }, [inSearchMode]);

  useEffect(() => {
    searchWidthAnim.value = withTiming(isExpanded ? 1 : 0, { duration: 300 });
  }, [isExpanded]);

  const animatedBgStyle = useAnimatedStyle(() => {
    return {
      opacity: bgOpacity.value,
    };
  });

  const animatedSearchStyle = useAnimatedStyle(() => {
    return {
      width: `${65 + (searchWidthAnim.value * 35)}%`,
    };
  });

  const animatedHeaderStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: searchBarTranslateY.value }],
    };
  });

  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);

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

  const loadUserData = useCallback(async () => {
    try {
      const m = getSavedItems('watchlist');
      const a = getSavedItems('artist');
      setSavedIds(new Set([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]));

      const w = getSavedItems('history');
      setWatchedIds(new Set(w.map((i: any) => i.id)));

      const sHistoryStr = await AsyncStorage.getItem('searchHistoryExpl');
      if (sHistoryStr) {
        const parsed = JSON.parse(sHistoryStr);
        setSearchHistory(Array.isArray(parsed) ? parsed.filter(i => typeof i === 'string') : []);
      }
    } catch (e) { console.error(e); }
  }, []);

  const lastPrefsRef = useRef<string>('');

  const fetchContent = useCallback(async (genreId: number = 0, forceRefresh: boolean = false) => {
    try {
      const prefs = await getUserPreferences();
      const content = await fetchPersonalisedDiscoveryContent(
        prefs.languages,
        prefs.genreIds,
        genreId,
        forceRefresh,
        prefs.favoriteActors
      );
      if (content) {
        setRawContent(content);
      }

      const history = getSavedItems('history');
      if (history && history.length > 0) {
        const similar = await getSimilarForHistory(history);
        setBecauseYouWatched(similar);
      }
    } catch (err) { console.error(err); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadUserData();
      getUserPreferences().then(prefs => {
        const actorsKey = (prefs.favoriteActors || []).map((a: any) => a.id).join(',');
        const currentHash = `${(prefs.languages || []).join(',')}-${(prefs.genreIds || []).join(',')}-${actorsKey}`;
        if (lastPrefsRef.current && lastPrefsRef.current !== currentHash) {
          fetchContent(selectedGenre, true);
        }
        lastPrefsRef.current = currentHash;
      });
    }, [loadUserData, fetchContent, selectedGenre])
  );

  const toggleWatchlist = useCallback((item: any) => {
    const isPerson = !!(item.profile_path || item.known_for_department);
    const type = isPerson ? 'artist' : 'watchlist';
    try {
      const exists = hasSavedItem(item.id, type);
      if (exists) {
        removeSavedItem(item.id, type);
      } else {
        addSavedItem(item, type);
      }
      setSavedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    setContentLoading(true);
    fetchContent(selectedGenre, false);
  }, [selectedGenre, fetchContent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContent(selectedGenre, true);
    setRefreshing(false);
  }, [selectedGenre, fetchContent]);

  useEffect(() => {
    if (!rawContent) return;

    const filteredContent = {
      trendingMovies: filterWatched(rawContent.trendingMovies, watchedIds),
      trendingTV: filterWatched(rawContent.trendingTV, watchedIds),
      topRated: filterWatched(rawContent.topRated, watchedIds),
      upcoming: filterWatched(rawContent.upcoming, watchedIds),
      hiddenGems: filterWatched(rawContent.hiddenGems, watchedIds),
      langData: {} as Record<string, any>,
      actorData: (rawContent.actorData || []).map((a: any) => ({
        ...a,
        items: filterWatched(a.items, watchedIds)
      })).filter((a: any) => a.items.length > 0),
      genreData: (rawContent.genreData || []).map((g: any) => ({
        ...g,
        items: filterWatched(g.items, watchedIds)
      })).filter((g: any) => g.items.length > 0),
    };

    if (rawContent.langData) {
      Object.keys(rawContent.langData).forEach(lang => {
        filteredContent.langData[lang] = {
          movies: filterWatched(rawContent.langData[lang].movies, watchedIds),
          tv: filterWatched(rawContent.langData[lang].tv, watchedIds)
        };
      });
    }

    setAllContent(filteredContent);
    setContentLoading(false);
  }, [rawContent, watchedIds]);

  const handleSearch = useCallback(async (searchText: string) => {
    let trimmed = searchText.trim();
    if (!trimmed) { setTmdbResults([]); setPeopleResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);

    // Intelligent Year Parsing: Remove e.g. " 2008" or " (2008)" from the end of the query
    const yearMatch = trimmed.match(/(?:\s+|\()([1-2][0-9]{3})(?:\))?$/);
    if (yearMatch) {
      trimmed = trimmed.replace(yearMatch[0], '').trim();
    }

    try {
      const [movies, people, collections] = await Promise.all([
        searchTMDB(trimmed),
        searchPeople(trimmed),
        searchCollections(trimmed)
      ]);

      const validMovies = movies.filter((item: any) => item.poster_path);
      const validCollections = collections.filter((item: any) => item.poster_path);

      // Combine collections and movies, placing collections at the top
      setTmdbResults([...validCollections, ...validMovies]);
      setPeopleResults(people.filter((item: any) => item.profile_path));
    } catch (error) { console.error('Search failed', error); } finally { setSearchLoading(false); }
  }, []);

  const saveSearchToHistory = async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed) return;
    try {
      const currentStr = await AsyncStorage.getItem('searchHistoryExpl');
      let currentList = currentStr ? JSON.parse(currentStr) : [];
      if (!Array.isArray(currentList)) currentList = [];
      currentList = currentList.filter((item: any) => typeof item === 'string' && item.toLowerCase() !== trimmed.toLowerCase());
      currentList.unshift(trimmed);
      if (currentList.length > 15) currentList = currentList.slice(0, 15);
      await AsyncStorage.setItem('searchHistoryExpl', JSON.stringify(currentList));
      setSearchHistory(currentList);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(query), 500);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);


  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <BlurTargetView ref={targetRef} style={{ flex: 1, backgroundColor: '#141414' }} collapsable={false}>
        <ScrollView
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          onScroll={(e) => {
            const currentOffset = e.nativeEvent.contentOffset.y;
            const diff = currentOffset - lastOffsetY.current;
            lastOffsetY.current = currentOffset;

            if (currentOffset <= 0) {
              searchBarTranslateY.value = withTiming(0, { duration: 150 });
            } else if (diff > 5 && searchBarTranslateY.value === 0 && !isSearchFocused && !inSearchMode) {
              searchBarTranslateY.value = withTiming(-100, { duration: 300 });
            } else if (diff < -5 && searchBarTranslateY.value < 0) {
              searchBarTranslateY.value = withTiming(0, { duration: 300 });
            }

            DeviceEventEmitter.emit('exploreScroll', currentOffset);

            if (scrollIdleTimeout.current) clearTimeout(scrollIdleTimeout.current);
            scrollIdleTimeout.current = setTimeout(() => {
              if (searchBarTranslateY.value < 0) {
                searchBarTranslateY.value = withTiming(0, { duration: 300 });
              }
            }, 2000);
          }}
          scrollEventThrottle={32}
          removeClippedSubviews={true}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
        >
          {contentLoading ? (
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
              <HeroSection items={allContent.heroMovies || allContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              <GenreFilter selectedGenre={selectedGenre} onSelectGenre={setSelectedGenre} />

              {becauseYouWatched.map((row, idx) => {
                const filtered = filterWatched(row.items, watchedIds);
                if (filtered.length === 0) return null;
                return (
                  <MediaCarousel key={`byw-${idx}`} title={`Because you watched ${row.sourceTitle}`} type="becauseyouwatched" data={filtered} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                );
              })}

              <MediaCarousel title="Trending Movies" type="trendingmovies" data={allContent.trendingMovies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              <MediaCarousel title="Coming Soon" type="upcoming" data={allContent.upcoming} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              <MediaCarousel title="Trending TV Shows" type="trendingtv" data={allContent.trendingTV} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              <MediaCarousel title="Top Rated Movies" type="toprated" data={allContent.topRated} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              <MediaCarousel title="Hidden Gems" type="hiddengems" data={allContent.hiddenGems} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />

              {/* Preferred Language Carousels */}
              {Object.keys(allContent.langData || {}).map(langCode => {
                const langInfo = LANGUAGE_OPTIONS.find(l => l.code === langCode);
                const langName = langInfo ? langInfo.label : langCode.toUpperCase();
                const movies = allContent.langData[langCode].movies;
                const tv = allContent.langData[langCode].tv;
                return (
                  <React.Fragment key={langCode}>
                    {movies && movies.length > 0 && (
                      <MediaCarousel title={`${langName} Movies`} type={`lang-movies-${langCode}`} data={movies} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                    )}
                    {tv && tv.length > 0 && (
                      <MediaCarousel title={`${langName} TV Shows`} type={`lang-tv-${langCode}`} data={tv} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                    )}
                  </React.Fragment>
                );
              })}

              {/* Favorite Actors Carousels */}
              {(allContent.actorData || []).map((act: any) => (
                <MediaCarousel
                  key={`actor-${act.actorId}`}
                  title={`Starring ${act.actorName}`}
                  type={`actor-${act.actorId}`}
                  data={act.items}
                  savedIds={savedIds}
                  toggleWatchlist={toggleWatchlist}
                />
              ))}
            </>
          )}
        </ScrollView>
      </BlurTargetView>

      <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 10 }, animatedBgStyle]} pointerEvents="none">
        <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} blurTarget={targetRef} blurMethod="dimezisBlurView" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(20, 20, 20, 0.6)' }]} />
      </Animated.View>

      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100 }} pointerEvents="box-none">
        <LinearGradient colors={['rgba(20, 20, 20, 0.9)', 'rgba(20, 20, 20, 0.4)', 'transparent']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: (StatusBar.currentHeight || 0) + 100 }} pointerEvents="none" />
        <Animated.View style={[styles.searchBarContainer, animatedHeaderStyle]} pointerEvents="box-none">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
            <Animated.View style={[styles.searchInputContainer, { overflow: 'hidden' }, animatedSearchStyle]}>
              <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} blurTarget={targetRef} blurMethod="dimezisBlurView" />
              <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#1C1C1E' }, animatedBgStyle]} pointerEvents="none" />
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
                keyboardAppearance="light"
                underlineColorAndroid="transparent"
                cursorColor="#E50914"
              />
              {searchLoading ? (
                <View style={{ paddingRight: 16 }}>
                  <ActivityIndicator color="#E50914" size={18} />
                </View>
              ) : query.length > 0 ? (
                <TouchableOpacity activeOpacity={0.95} onPress={() => setQuery('')} style={{ paddingRight: 16 }}>
                  <MaterialIcons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/settings')} style={{ paddingRight: 16 }}>
                  <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      {inSearchMode && (
        <SearchResultsList
          peopleResults={peopleResults}
          tmdbResults={tmdbResults}
          savedIds={savedIds}
          toggleWatchlist={toggleWatchlist}
        />
      )}
    </View>
  );
};

export default ExplorePage;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414', overflow: 'hidden' },
  scrollContent: { paddingTop: (StatusBar.currentHeight || 0) + 70, paddingBottom: 110 },
  searchBarContainer: { paddingHorizontal: HORIZONTAL_MARGIN, paddingTop: (StatusBar.currentHeight || 0) + 4, paddingBottom: 12, backgroundColor: 'transparent', borderBottomWidth: 0 },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, height: 48, borderWidth: 0, backgroundColor: 'transparent' },
  searchInput: { flex: 1, backgroundColor: 'transparent', height: 48, fontSize: 16, color: '#FFFFFF', paddingLeft: 4, fontFamily: 'GoogleSansFlex-Medium' },
  searchIconContainer: { paddingLeft: 12, paddingRight: 4, justifyContent: 'center', alignItems: 'center' },
  historyDropdown: {
    backgroundColor: '#1C1C1E',
    marginHorizontal: 16,
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    zIndex: 99,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  historyText: {
    flex: 1,
    color: '#E0E0E0',
    fontSize: 15,
    fontFamily: 'GoogleSansFlex-Regular',
  },

  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
  },

  skeletonContainer: { marginBottom: 24, paddingLeft: HORIZONTAL_MARGIN },
  skeletonTitle: { width: 140, height: 20, backgroundColor: '#222', borderRadius: 4, marginBottom: 12 },
  skeletonCard: { width: 130, height: 195, backgroundColor: '#222', borderRadius: 8, marginRight: 12 },
});
