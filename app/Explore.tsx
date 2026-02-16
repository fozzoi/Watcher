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
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAllDiscoveryContent,
  searchTMDB,
  searchPeople,
} from '../src/tmdb';

// --- COMPONENTS ---
import AtmosphericBackground from './components/AtmosphericBackground';
import SkeletonHero from './components/SkeletonHero';
import HeroSection from './components/HeroSection';
import GenreFilter from './components/GenreFilter';
import MediaCarousel from './components/MediaCarousel';
import SearchResultsList from './components/SearchResultsList';
import { HORIZONTAL_MARGIN } from './components/ExploreConstants';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const ExplorePage = () => {
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());

  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [peopleResults, setPeopleResults] = useState<any[]>([]);
  
  const [allContent, setAllContent] = useState<any>({
    trendingMovies: [], trendingTV: [], topRated: [], regional: [],
    hindiMovies: [], malayalamMovies: [], tamilMovies: [],
    hindiTV: [], malayalamTV: [], koreanMovies: [], koreanTV: [],
    japaneseMovies: [], japaneseTV: [], animeMovies: [], animeShows: [],
    animatedMovies: [], upcoming: [], hiddenGems: [], nostalgia: []
  });

  const navigation = useNavigation<any>();
  const searchTimeout = useRef<any>(null);

  // --- FAST BACK HANDLER ---
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

  const loadFavorites = useCallback(async () => {
    try {
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const m = mStr ? JSON.parse(mStr) : [];
      const a = aStr ? JSON.parse(aStr) : [];
      setSavedIds(new Set([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]));
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadFavorites(); }, [loadFavorites]));

  const toggleWatchlist = useCallback(async (item: any) => {
    const isPerson = !!(item.profile_path || item.known_for_department);
    const key = isPerson ? 'favoriteArtists' : 'watchlist';
    try {
        const currentStr = await AsyncStorage.getItem(key);
        let currentList = currentStr ? JSON.parse(currentStr) : [];
        if (currentList.find((i: any) => i.id === item.id)) currentList = currentList.filter((i: any) => i.id !== item.id);
        else currentList.push(item);
        await AsyncStorage.setItem(key, JSON.stringify(currentList));
        setSavedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; });
    } catch (e) { console.error(e); }
  }, []);

  const fetchContent = useCallback(async (genreId: number = 0) => {
    setContentLoading(true);
    try {
      const content = await fetchAllDiscoveryContent(genreId);
      setAllContent(content);
    } catch (err) { console.error(err); } finally { setContentLoading(false); }
  }, []);

  useEffect(() => { fetchContent(selectedGenre); }, [selectedGenre, fetchContent]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchContent(selectedGenre);
    setRefreshing(false);
  }, [selectedGenre, fetchContent]);

  const handleSearch = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    if (!trimmed) { setTmdbResults([]); setPeopleResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    try {
      const [movies, people] = await Promise.all([searchTMDB(trimmed), searchPeople(trimmed)]);
      setTmdbResults(movies.filter((item: any) => item.poster_path));
      setPeopleResults(people.filter((item: any) => item.profile_path));
    } catch (error) { Alert.alert('Error', 'Search failed'); } finally { setSearchLoading(false); }
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => handleSearch(query), 500);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  const inSearchMode = query.trim() !== '';

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <AtmosphericBackground />

      {/* --- HEADER (Search Bar + Buttons) --- */}
      <View style={[styles.searchBarContainer, { zIndex: 100 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}> 
          <View style={[styles.searchInputContainer, { flex: 1 }]}>
            <TextInput
              placeholder="Search movies, cast..."
              placeholderTextColor="#8C8C8C"
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              selectionColor="#E50914"
              returnKeyType="search"
              keyboardAppearance="light"
              underlineColor="transparent"
              cursorColor="#E50914"
              activeUnderlineColor="transparent"
              textColor='white'
            />
            <View style={styles.searchIconContainer}>
              {searchLoading ? (
                <ActivityIndicator color="#E50914" size={18} />
              ) : query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery('')}>
                  <MaterialIcons name="close" size={22} color="#8C8C8C" />
                </TouchableOpacity>
              ) : (
                <Ionicons name="search" size={20} color="#8C8C8C" />
              )}
            </View>
          </View>

          {/* AI Button */}
          <TouchableOpacity onPress={() => navigation.navigate('AiSearch')}
            style={styles.iconButtonAi}
          >
            <Ionicons name="sparkles" size={20} color="#A962FF" />
          </TouchableOpacity>

          {/* Settings Button */}
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')}
            style={styles.iconButton}
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* --- CONTENT AREA --- */}
      <View style={{ flex: 1, position: 'relative' }}>
        
        {/* A. SEARCH RESULTS LAYER */}
        {inSearchMode && (
          <SearchResultsList 
            peopleResults={peopleResults}
            tmdbResults={tmdbResults}
            savedIds={savedIds}
            toggleWatchlist={toggleWatchlist}
            navigation={navigation}
          />
        )}

        {/* B. EXPLORE LAYER */}
        <View style={{ flex: 1, display: inSearchMode ? 'none' : 'flex' }}>
          <AnimatedScrollView 
            scrollEventThrottle={16} 
            removeClippedSubviews={true} 
            contentContainerStyle={styles.scrollContent} 
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}
          >
            {contentLoading ? <SkeletonHero /> : (
              <>
                <HeroSection items={allContent.trendingMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <GenreFilter selectedGenre={selectedGenre} onSelectGenre={setSelectedGenre} />
              </>
            )}

            <MediaCarousel title="🗓️ Coming Soon" data={allContent.upcoming} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="💎 Hidden Gems" data={allContent.hiddenGems} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Trending TV Shows" data={allContent.trendingTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Top Rated Movies" data={allContent.topRated} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Popular in Your Region" data={allContent.regional} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Animated Movies" data={allContent.animatedMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Anime Series" data={allContent.animeShows} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Anime Movies" data={allContent.animeMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Korean TV Shows" data={allContent.koreanTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Korean Movies" data={allContent.koreanMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Japanese TV Shows" data={allContent.japaneseTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Japanese Movies" data={allContent.japaneseMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Hindi Movies" data={allContent.hindiMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Hindi Web Series" data={allContent.hindiTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Malayalam Movies" data={allContent.malayalamMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Malayalam Web Series" data={allContent.malayalamTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
            <MediaCarousel title="Tamil Movies" data={allContent.tamilMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
          </AnimatedScrollView>
        </View>

      </View>
    </View>
  );
};

export default ExplorePage;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  scrollContent: { paddingTop: 10, paddingBottom: 80 }, 
  
  searchBarContainer: { paddingHorizontal: HORIZONTAL_MARGIN, paddingTop: (StatusBar.currentHeight || 0) + 12, paddingBottom: 12, backgroundColor: 'rgba(20, 20, 20, 0.98)', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 14, height: 48, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  searchInput: { flex: 1, backgroundColor: 'transparent', height: 48, fontSize: 16, color: 'white', paddingLeft: 16, fontFamily: 'GoogleSansFlex-Regular' },
  searchIconContainer: { paddingHorizontal: 12 },

  iconButtonAi: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#222', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#A962FF'
  },
  iconButton: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: '#222', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)'
  }
});