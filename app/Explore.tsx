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
  Text,
  Image,
} from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Ionicons, MaterialIcons, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAllDiscoveryContent,
  searchTMDB,
  searchPeople,
  getImageUrl,
} from '../src/tmdb';
import { getAllProgress, removeProgress, WatchProgress } from '../src/utils/progress'; 

// --- COMPONENTS ---
import AtmosphericBackground from './components/AtmosphericBackground';
import SkeletonHero from './components/SkeletonHero';
import HeroSection from './components/HeroSection';
import GenreFilter from './components/GenreFilter';
import MediaCarousel from './components/MediaCarousel';
import SearchResultsList from './components/SearchResultsList';
import { HORIZONTAL_MARGIN } from './components/ExploreConstants';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

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

const ExplorePage = () => {
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [contentLoading, setContentLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [watchedIds, setWatchedIds] = useState<Set<number>>(new Set()); 
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>([]); 

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
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const m = mStr ? JSON.parse(mStr) : [];
      const a = aStr ? JSON.parse(aStr) : [];
      setSavedIds(new Set([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]));

      const watchedStr = await AsyncStorage.getItem('watched');
      const w = watchedStr ? JSON.parse(watchedStr) : [];
      setWatchedIds(new Set(w.map((i: any) => i.id)));

      const history = await getAllProgress();
      setWatchHistory(history);
    } catch (e) { console.error(e); }
  }, []);

  useFocusEffect(useCallback(() => { loadUserData(); }, [loadUserData]));

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

  // --- REMOVE HISTORY ITEM ---
  const handleRemoveHistoryItem = async (tmdbId: number) => {
    await removeProgress(tmdbId);
    // Update local state to immediately remove the card smoothly
    setWatchHistory(prev => prev.filter(item => item.tmdbId !== tmdbId));
  };

  const filterWatched = (list: any[], wIds: Set<number>) => {
      if (!list) return [];
      return list.filter((item: any) => !wIds.has(item.id));
  };

  const fetchContent = useCallback(async (genreId: number = 0) => {
    setContentLoading(true);
    try {
      const content = await fetchAllDiscoveryContent(genreId);
      
      const filteredContent = {
         trendingMovies: filterWatched(content.trendingMovies, watchedIds),
         trendingTV: filterWatched(content.trendingTV, watchedIds),
         topRated: filterWatched(content.topRated, watchedIds),
         regional: filterWatched(content.regional, watchedIds),
         hindiMovies: filterWatched(content.hindiMovies, watchedIds),
         malayalamMovies: filterWatched(content.malayalamMovies, watchedIds),
         tamilMovies: filterWatched(content.tamilMovies, watchedIds),
         hindiTV: filterWatched(content.hindiTV, watchedIds),
         malayalamTV: filterWatched(content.malayalamTV, watchedIds),
         koreanMovies: filterWatched(content.koreanMovies, watchedIds),
         koreanTV: filterWatched(content.koreanTV, watchedIds),
         japaneseMovies: filterWatched(content.japaneseMovies, watchedIds),
         japaneseTV: filterWatched(content.japaneseTV, watchedIds),
         animeMovies: filterWatched(content.animeMovies, watchedIds),
         animeShows: filterWatched(content.animeShows, watchedIds),
         animatedMovies: filterWatched(content.animatedMovies, watchedIds),
         upcoming: filterWatched(content.upcoming, watchedIds),
         hiddenGems: filterWatched(content.hiddenGems, watchedIds),
         nostalgia: filterWatched(content.nostalgia, watchedIds),
      };

      setAllContent(filteredContent);
    } catch (err) { console.error(err); } finally { setContentLoading(false); }
  }, [watchedIds]); 

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

  const renderHistoryCard = (item: WatchProgress, index: number) => {
      const date = new Date(item.updatedAt);
      const isToday = new Date().toDateString() === date.toDateString();
      const dateString = isToday ? 'Today' : `${date.getDate()}/${date.getMonth() + 1}`;

      return (
          <Animated.View 
              key={item.tmdbId} 
              entering={FadeInDown.delay(index * 50)} 
              layout={Layout.springify()} // Smooth collapse when X is pressed
          >
            <TouchableOpacity 
                style={styles.historyCard}
                onPress={() => navigation.navigate('Detail', { 
                    movie: { id: item.tmdbId, media_type: item.mediaType } 
                })}
            >
                <View>
                    <Image source={{ uri: getImageUrl(item.poster, 'w342') }} style={styles.historyImage} />
                    <View style={styles.historyOverlay}>
                        <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.8)" />
                    </View>
                </View>
                <View style={styles.historyTextContainer}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{item.title || "Unknown"}</Text>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                        <Text style={styles.historySubtitle}>
                            {item.mediaType === 'tv' ? `S${item.lastSeason} : E${item.lastEpisode}` : 'Movie'}
                        </Text>
                        <Text style={styles.historyDate}>{dateString}</Text>
                    </View>
                </View>

                {/* THE "X" REMOVE BUTTON */}
                <TouchableOpacity 
                  style={styles.removeHistoryBtn}
                  onPress={(e) => {
                      e.stopPropagation(); // Prevents navigating to DetailPage
                      handleRemoveHistoryItem(item.tmdbId);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <View style={styles.removeHistoryBg}>
                        <Ionicons name="close" size={14} color="#FFF" />
                    </View>
                </TouchableOpacity>

            </TouchableOpacity>
          </Animated.View>
      );
  };

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <AtmosphericBackground />

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

          <TouchableOpacity onPress={() => navigation.navigate('AiSearch')} style={styles.iconButtonAi}>
            <Ionicons name="sparkles" size={20} color="#A962FF" />
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.iconButton}>
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1, position: 'relative' }}>
        
        {inSearchMode && (
          <SearchResultsList 
            peopleResults={peopleResults}
            tmdbResults={tmdbResults}
            savedIds={savedIds}
            toggleWatchlist={toggleWatchlist}
            navigation={navigation}
          />
        )}

        <View style={{ flex: 1, display: inSearchMode ? 'none' : 'flex' }}>
          <AnimatedScrollView 
            scrollEventThrottle={16} 
            removeClippedSubviews={true} 
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
                <HeroSection items={allContent.trendingMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <GenreFilter selectedGenre={selectedGenre} onSelectGenre={setSelectedGenre} />

                {/* {watchHistory.length > 0 && (
                    <View style={styles.historySection}>
                        <View style={{flexDirection: 'row', alignItems: 'center', marginLeft: HORIZONTAL_MARGIN, marginBottom: 12, gap: 8}}>
                            <Feather name="clock" size={20} color="#fff" />
                            <Text style={styles.historySectionTitle}>Jump Back In</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingLeft: HORIZONTAL_MARGIN }}>
                            {watchHistory.slice(0, 8).map((item, index) => renderHistoryCard(item, index))}
                        </ScrollView>
                    </View>
                )} */}

                <MediaCarousel title="🗓️ Coming Soon" type="upcoming" data={allContent.upcoming} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="💎 Hidden Gems" type="hiddengems" data={allContent.hiddenGems} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Trending TV Shows" type="trendingtv" data={allContent.trendingTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Top Rated Movies" type="toprated" data={allContent.topRated} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Popular in Your Region" type="regional" data={allContent.regional} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Animated Movies" type="animatedmovies" data={allContent.animatedMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Anime Series" type="animeshows" data={allContent.animeShows} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Anime Movies" type="animemovies" data={allContent.animeMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Korean TV Shows" type="koreantv" data={allContent.koreanTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Korean Movies" type="koreanmovies" data={allContent.koreanMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Japanese TV Shows" type="japanesetv" data={allContent.japaneseTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Japanese Movies" type="japanesemovies" data={allContent.japaneseMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Hindi Movies" type="hindimovies" data={allContent.hindiMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Hindi Web Series" type="hinditv" data={allContent.hindiTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Malayalam Movies" type="malayalammovies" data={allContent.malayalamMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Malayalam Web Series" type="malayalamtv" data={allContent.malayalamTV} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
                <MediaCarousel title="Tamil Movies" type="tamilmovies" data={allContent.tamilMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
              </>
            )}

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
  },

  historySection: {
      marginBottom: 30,
      marginTop: 10,
  },
  historySectionTitle: {
      color: '#fff',
      fontSize: 18,
      fontFamily: 'GoogleSansFlex-Bold',
  },
  historyCard: {
      width: 140,
      marginRight: 12,
      backgroundColor: '#222',
      borderRadius: 10,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#333',
      position: 'relative', 
  },
  historyImage: {
      width: '100%',
      height: 85,
      backgroundColor: '#333',
  },
  historyOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.3)',
      justifyContent: 'center',
      alignItems: 'center',
  },
  historyTextContainer: {
      padding: 8,
  },
  historyTitle: {
      color: '#fff',
      fontSize: 13,
      fontFamily: 'GoogleSansFlex-Medium',
      marginBottom: 4,
  },
  historySubtitle: {
      color: '#E50914',
      fontSize: 10,
      fontFamily: 'GoogleSansFlex-Bold',
  },
  historyDate: {
      color: '#888',
      fontSize: 10,
  },
  
  // NEW STYLES FOR X BUTTON
  removeHistoryBtn: {
      position: 'absolute',
      top: 6,
      right: 6,
      zIndex: 10,
  },
  removeHistoryBg: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)'
  },

  skeletonContainer: {
    marginBottom: 24,
  },
  skeletonTitle: {
    width: 140,
    height: 20,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    marginBottom: 12,
    marginLeft: HORIZONTAL_MARGIN,
  },
  skeletonCard: {
    width: 120,
    height: 180,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    marginRight: 12,
  }
});