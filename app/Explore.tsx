// app/Explore.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  memo,
  useRef,
} from 'react';
import {
  View,
  Text,
  Image,
  Alert,
  Dimensions,
  StyleSheet,
  RefreshControl,
  StatusBar,
  ScrollView,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { ActivityIndicator, TextInput } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  withRepeat,
} from 'react-native-reanimated';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchAllDiscoveryContent,
  getImageUrl,
  getFullDetails,
  TMDBResult,
  searchTMDB,
  searchPeople,
  TMDBPerson
} from '../src/tmdb';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');
const HORIZONTAL_MARGIN = 16;
const GAP_SIZE = 12;

// --- DIMENSIONS ---
const AVAILABLE_WIDTH = width - (HORIZONTAL_MARGIN * 2) - (GAP_SIZE * 2);
const EXPLORE_CARD_WIDTH = AVAILABLE_WIDTH / 3; 
const SEARCH_CARD_WIDTH = (width - HORIZONTAL_MARGIN * 2 - GAP_SIZE) / 3;
const HERO_CARD_WIDTH = width - HORIZONTAL_MARGIN * 2;
const HERO_HEIGHT = height * 0.55; 

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

// --- GENRE DATA ---
const GENRE_DATA = [
  { id: 0, name: 'All', icon: '🎬' },
  { id: 28, name: 'Action', icon: '💥' },
  { id: 12, name: 'Adventure', icon: '🗺️' },
  { id: 16, name: 'Animation', icon: '🎨' },
  { id: 35, name: 'Comedy', icon: '😂' },
  { id: 80, name: 'Crime', icon: '🔪' },
  { id: 27, name: 'Horror', icon: '👻' },
  { id: 10749, name: 'Romance', icon: '💕' },
  { id: 878, name: 'Sci-Fi', icon: '🚀' },
  { id: 53, name: 'Thriller', icon: '😱' },
];

// --- 1. BACKGROUND ---
const AtmosphericBackground = memo(() => {
  const rotate1 = useSharedValue(0);
  const rotate2 = useSharedValue(45);

  useEffect(() => {
    rotate1.value = withRepeat(withTiming(360, { duration: 35000, easing: Easing.linear }), -1);
    rotate2.value = withRepeat(withTiming(405, { duration: 40000, easing: Easing.linear }), -1);
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate1.value}deg` }] }));
  const animatedStyle2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate2.value}deg` }] }));

  return (
    <View style={styles.atmosContainer} pointerEvents="none">
      <Animated.View style={[styles.atmosGradientWrapper, animatedStyle1]}>
        <LinearGradient colors={['rgba(229, 9, 20, 0.2)', 'rgba(10, 20, 178, 0)']} style={styles.atmosGradient} />
      </Animated.View>
      <Animated.View style={[styles.atmosGradientWrapper, animatedStyle2]}>
        <LinearGradient colors={['rgba(22, 178, 10, 0.2)', 'rgba(178, 10, 166, 0)']} style={styles.atmosGradient} />
      </Animated.View>
    </View>
  );
});

// --- COMPONENT: Quick Add Button ---
const QuickAddButton = memo(({ isAdded, onPress }: { isAdded: boolean, onPress: () => void }) => (
  <TouchableOpacity
    activeOpacity={0.7}
    onPress={(e) => { e.stopPropagation(); onPress(); }}
    style={styles.quickAddWrapper}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <Ionicons name={isAdded ? "bookmark" : "bookmark-outline"} size={20} color={isAdded ? "#E50914" : "#FFFFFF"} />
  </TouchableOpacity>
));

// --- 2. SKELETONS ---
const SkeletonHero = memo(() => (
  <View style={[styles.heroContainer, { marginHorizontal: HORIZONTAL_MARGIN }]}>
    <View style={styles.heroLoading}>
      <ActivityIndicator color="#E50914" size="large" />
    </View>
  </View>
));

// --- 3. HERO ---
const HeroItem = memo(({ item, navigation, toggleWatchlist, isAdded }: any) => {
  const handlePress = useCallback(async () => {
    try {
      const fullDetails = await getFullDetails(item);
      navigation.navigate('Detail', { movie: fullDetails });
    } catch (error) { console.error(error); }
  }, [item, navigation]);

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.heroItemContainer} onPress={handlePress}>
      <Image source={{ uri: getImageUrl(item.poster_path, 'w500') }} style={styles.heroImage} resizeMode="cover" />
      <View style={styles.heroAddButtonContainer}><QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item)} /></View>
      <LinearGradient colors={['transparent', 'rgba(20, 20, 20, 0.5)', 'rgba(20, 20, 20, 1)']} style={styles.heroGradient}>
        <View style={styles.heroContentWrapper}>
          <Text style={styles.heroTitle} numberOfLines={1}>{item.title || item.name}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.ratingBadge}><Ionicons name="star" size={14} color="#FFD700" /><Text style={styles.ratingText}>{item.vote_average?.toFixed(1) || 'N/A'}</Text></View>
            <Text style={styles.heroYear}>{(item.release_date || item.first_air_date || '').substring(0, 4)}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const FeaturedHero = memo(({ items, navigation, toggleWatchlist, savedIds }: any) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlashList<TMDBResult>>(null);

  useEffect(() => {
    if (!items || items.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % Math.min(5, items.length);
        listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        return nextIndex;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={[styles.heroContainer, { marginHorizontal: HORIZONTAL_MARGIN }]}>
        <FlashList
          ref={listRef}
          data={items.slice(0, 5)}
          renderItem={({ item }) => <HeroItem item={item} navigation={navigation} isAdded={savedIds.has(item.id)} toggleWatchlist={toggleWatchlist} />}
          keyExtractor={item => `hero-${item.id}`}
          horizontal pagingEnabled estimatedItemSize={HERO_CARD_WIDTH} showsHorizontalScrollIndicator={false}
          onScroll={(e) => { const index = Math.round(e.nativeEvent.contentOffset.x / HERO_CARD_WIDTH); if (index !== activeIndex) setActiveIndex(index); }}
          scrollEventThrottle={16}
        />
      </View>
      <View style={styles.paginationContainer}>
        {items.slice(0, 5).map((_, index: number) => (
          <View key={index} style={[styles.paginationDot, activeIndex === index && styles.paginationDotActive]} />
        ))}
      </View>
    </View>
  );
});

// --- 4. GENRE FILTER ---
const GenreFilter = memo(({ selectedGenre, onSelectGenre }: any) => (
  <View style={styles.genreFilterContainer}>
    <FlatList
      horizontal data={GENRE_DATA} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreFilterContent}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={0.7} onPress={() => onSelectGenre(item.id)} style={[styles.genreChip, selectedGenre === item.id && styles.genreChipActive]}>
          <Text style={styles.genreChipIcon}>{item.icon}</Text>
          <Text style={[styles.genreChipText, selectedGenre === item.id && styles.genreChipTextActive]}>{item.name}</Text>
        </TouchableOpacity>
      )}
      keyExtractor={item => `genre-${item.id}`}
    />
  </View>
));

// --- 5. MOVIE CARD ---
const MovieCard = memo(({ item, onPress, isSearchMode = false, isAdded, toggleWatchlist }: any) => {
  const cardWidth = isSearchMode ? SEARCH_CARD_WIDTH : EXPLORE_CARD_WIDTH;
  const cardHeight = cardWidth * 1.5;

  if (!item.poster_path) return <View style={{ width: cardWidth, height: cardHeight, marginRight: GAP_SIZE }} />;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ width: cardWidth, marginRight: isSearchMode ? 0 : GAP_SIZE, marginBottom: isSearchMode ? 16 : 0 }}>
      <View style={styles.cardContainer}>
        <Image source={{ uri: getImageUrl(item.poster_path, 'w185') }} style={[styles.sectionImage, { width: cardWidth, height: cardHeight }]} resizeMode="cover" />
        <View style={styles.cardAddButtonOverlay}><QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item)} /></View>
        <View style={styles.cardOverlay}><View style={styles.ratingBadgeSmall}><Ionicons name="star" size={10} color="#FFD700" /><Text style={styles.ratingTextSmall}>{item.vote_average?.toFixed(1) || 'N/A'}</Text></View></View>
      </View>
      {isSearchMode && <Text style={styles.sectionItemTitle} numberOfLines={2}>{item.title || item.name}</Text>}
    </TouchableOpacity>
  );
});

// --- 6. MEDIA CAROUSEL ---
const MediaCarousel = memo(({ title, data, navigation, savedIds, toggleWatchlist }: any) => {
  if (!data || data.length === 0) return null;
  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: HORIZONTAL_MARGIN }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ViewAll', { title, data })}><MaterialIcons name="chevron-right" size={24} color="#8C8C8C" /></TouchableOpacity>
      </View>
      <FlashList
        horizontal data={data} estimatedItemSize={EXPLORE_CARD_WIDTH + GAP_SIZE} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: HORIZONTAL_MARGIN }}
        removeClippedSubviews={true} keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <MovieCard item={item} isAdded={savedIds.has(item.id)} toggleWatchlist={toggleWatchlist} onPress={async () => {
            const fullDetails = await getFullDetails(item);
            navigation.navigate('Detail', { movie: fullDetails });
          }} />
        )}
      />
    </View>
  );
});

// --- 7. MAIN EXPLORE PAGE ---
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

      <View style={styles.searchBarContainer}>
        {/* Added a Row Wrapper here */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}> 
          
          {/* Added flex: 1 to searchInputContainer so it takes available space */}
          <View style={[styles.searchInputContainer, { flex: 1 }]}>
            <TextInput
              textColor="white"
              placeholder="Search movies, cast..."
              value={query}
              onChangeText={setQuery}
              underlineColor="transparent"
              activeUnderlineColor="transparent"
              cursorColor="#E50914"
              placeholderTextColor="#8C8C8C"
              style={styles.searchInput}
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
          <TouchableOpacity onPress={() => navigation.navigate('AiSearch')}
              style={{
                width: 48, height: 48, borderRadius: 14, backgroundColor: '#222', 
                justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#A962FF' // Purple border for AI
              }}
            >
              <Ionicons name="sparkles" size={20} color="#A962FF" />
          </TouchableOpacity>

          {/* --- SETTINGS BUTTON --- */}
          <TouchableOpacity 
            onPress={() => navigation.navigate('Settings')}
            style={{
              width: 48, 
              height: 48, 
              borderRadius: 14, 
              backgroundColor: '#222', 
              justifyContent: 'center', 
              alignItems: 'center',
              borderWidth: 1, 
              borderColor: 'rgba(255, 255, 255, 0.1)'
            }}
          >
            <Ionicons name="settings-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          

        </View>
      </View>

      {inSearchMode ? (
        <ScrollView contentContainerStyle={styles.searchScrollContent} removeClippedSubviews={true}>
          {peopleResults.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={styles.searchHeading}>People</Text>
              <FlatList
                horizontal data={peopleResults} keyExtractor={item => `person-${item.id}`} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 4 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.personItem} onPress={() => navigation.navigate('CastDetails', { personId: item.id })}>
                    <Image source={{ uri: getImageUrl(item.profile_path, 'w185') }} style={styles.personImage} />
                    <Text style={styles.personName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          <Text style={styles.searchHeading}>Movies & Shows</Text>
          <View style={styles.searchResultsGrid}>
            {tmdbResults.map((result: any) => (
              <MovieCard
                key={result.id} item={result} isSearchMode={true} isAdded={savedIds.has(result.id)} toggleWatchlist={toggleWatchlist}
                onPress={async () => { const fullDetails = await getFullDetails(result); navigation.navigate('Detail', { movie: fullDetails }); }}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        <AnimatedScrollView scrollEventThrottle={16} removeClippedSubviews={true} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E50914" />}>
          {contentLoading ? <SkeletonHero /> : (
            <>
              <FeaturedHero items={allContent.trendingMovies} navigation={navigation} savedIds={savedIds} toggleWatchlist={toggleWatchlist} />
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
      )}
    </View>
  );
};

export default ExplorePage;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  scrollContent: { paddingTop: 10, paddingBottom: 80 }, 
  searchScrollContent: { paddingTop: 20, paddingBottom: 80, paddingHorizontal: HORIZONTAL_MARGIN },

  quickAddWrapper: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  cardAddButtonOverlay: { position: 'absolute', top: 6, right: 6, zIndex: 10 },
  heroAddButtonContainer: { position: 'absolute', top: 16, right: 16, zIndex: 20 },

  atmosContainer: { ...StyleSheet.absoluteFillObject, zIndex: -1, backgroundColor: '#141414', overflow: 'hidden' },
  atmosGradientWrapper: { position: 'absolute', width: width * 1.5, height: width * 1.5, left: -width / 4, top: -width / 4 },
  atmosGradient: { width: '100%', height: '100%', opacity: 0.25 },

  searchBarContainer: { paddingHorizontal: HORIZONTAL_MARGIN, paddingTop: (StatusBar.currentHeight || 0) + 12, paddingBottom: 12, backgroundColor: 'rgba(20, 20, 20, 0.98)', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.08)' },
  searchInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#222', borderRadius: 14, height: 48, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)' },
  searchInput: { flex: 1, backgroundColor: 'transparent', height: 48, fontSize: 16, color: 'white', paddingLeft: 16, fontFamily: 'GoogleSansFlex-Regular' },
  searchIconContainer: { paddingHorizontal: 12 },

  heroContainer: { width: HERO_CARD_WIDTH, height: HERO_HEIGHT, backgroundColor: '#1A1A1A', borderRadius: 20, overflow: 'hidden', alignSelf: 'center', marginBottom: 16 },
  heroLoading: { height: HERO_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  heroItemContainer: { width: HERO_CARD_WIDTH, height: HERO_HEIGHT },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', justifyContent: 'flex-end', padding: 20 },
  heroContentWrapper: { gap: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontFamily: 'GoogleSansFlex-Bold' },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  ratingText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'GoogleSansFlex-Bold' },
  heroYear: { color: '#DDD', fontSize: 15, fontFamily: 'GoogleSansFlex-Regular' },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  paginationDotActive: { backgroundColor: '#E50914', width: 24, height: 8, borderRadius: 4 },

  genreFilterContainer: { marginVertical: 18 },
  genreFilterContent: { paddingHorizontal: HORIZONTAL_MARGIN, gap: 10 },
  genreChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, backgroundColor: '#1E1E1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  genreChipActive: { backgroundColor: '#E50914', borderColor: '#E50914' },
  genreChipIcon: { fontSize: 16, marginRight: 8 },
  genreChipText: { color: '#AAA', fontSize: 14, fontFamily: 'GoogleSansFlex-Regular' },
  genreChipTextActive: { color: '#FFFFFF', fontFamily: 'GoogleSansFlex-Bold' },

  sectionContainer: { paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#FFFFFF', fontSize: 21, fontFamily: 'GoogleSansFlex-Bold' },
  
  cardContainer: { position: 'relative' },
  sectionImage: { borderRadius: 12, backgroundColor: '#1A1A1A' },
  cardOverlay: { position: 'absolute', bottom: 8, left: 8 },
  ratingBadgeSmall: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, gap: 3 },
  ratingTextSmall: { color: '#FFFFFF', fontSize: 11, fontFamily: 'GoogleSansFlex-Bold' },
  sectionItemTitle: { color: '#DDD', fontSize: 13.5, marginTop: 8, lineHeight: 18, fontFamily: 'GoogleSansFlex-Regular' },
  searchResultsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  
  searchHeading: { color: '#FFFFFF', fontSize: 20, fontFamily: 'GoogleSansFlex-Bold', marginBottom: 16, marginLeft: 4 },
  personItem: { width: 90, marginRight: 16, alignItems: 'center' },
  personImage: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#222', marginBottom: 8 },
  personName: { color: '#FFFFFF', fontSize: 13, fontFamily: 'GoogleSansFlex-Regular', textAlign: 'center' },
});