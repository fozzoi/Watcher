import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  Image, 
  StatusBar,
  Modal,
  ScrollView
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { getImageUrl, getFullDetails, TMDBResult, getDiscoverMedia, fetchMoreContentByType } from '../src/tmdb';
import { Ionicons, Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

const ViewAllPage = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  
  const { title, data, genreId, type = 'trendingmovies' } = route.params as {
    title: string;
    data?: TMDBResult[];
    genreId?: number;
    type?: string; 
  };

  const [movies, setMovies] = useState<TMDBResult[]>(data || []);
  const [isLoading, setIsLoading] = useState(!data);
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // --- FILTER STATE ---
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    genreId: genreId || null,
    year: '',
    language: '',
    rating: 0,
  });

  const years = ['2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2015', '2010'];
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'ml', name: 'Malayalam' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ta', name: 'Tamil' },
    { code: 'ko', name: 'Korean' },
    { code: 'ja', name: 'Japanese' },
  ];
  const ratings = [9, 8, 7, 6, 5];

  // --- FETCHING LOGIC ---
  const fetchContent = async (pageNum: number, currentFilters: typeof filters, isReset: boolean = false) => {
    if (isReset) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const hasCustomFilters = currentFilters.year || currentFilters.language || currentFilters.rating > 0;
      let results: TMDBResult[] = [];

      if (hasCustomFilters) {
        // If filtering, use the Discover API and pass 'type' as the baseCategory
        const baseMediaType = type.toLowerCase().includes('tv') || type.toLowerCase().includes('shows') ? 'tv' : 'movie';
        results = await getDiscoverMedia(baseMediaType, pageNum, currentFilters, type);
      } else {
        // If NO filters, fetch the exact category endpoint to keep pagination relevant
        const fetchType = currentFilters.genreId ? `genre/${currentFilters.genreId}` : type;
        results = await fetchMoreContentByType(fetchType, pageNum);
      }
      
      if (results.length === 0) {
        setHasMore(false);
      } else {
        // Filter out duplicates before adding to state
        setMovies(prev => {
          if (isReset) return results;
          const existingIds = new Set(prev.map(m => m.id));
          const newUniqueMovies = results.filter(m => !existingIds.has(m.id));
          return [...prev, ...newUniqueMovies];
        });
        setPage(pageNum);
        setHasMore(true);
      }
    } catch (error) {
      console.error("Failed to fetch movies:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!data || data.length === 0) {
      fetchContent(1, filters, true);
    } else {
      setPage(1);
      setHasMore(true);
    }
  }, []);

  const loadMoreMovies = () => {
    if (isLoading || isLoadingMore || !hasMore) return;
    fetchContent(page + 1, filters, false);
  };

  const applyFilters = () => {
    setShowFilters(false);
    setMovies([]); 
    fetchContent(1, filters, true); 
  };

  const resetFilters = () => {
    const defaultFilters = { genreId: genreId || null, year: '', language: '', rating: 0 };
    setFilters(defaultFilters);
    setShowFilters(false);
    setMovies([]);
    fetchContent(1, defaultFilters, true);
  };

  // --- RENDERERS ---
  const renderMovieCard = ({ item }: { item: TMDBResult }) => (
    <TouchableOpacity
      style={styles.cardContainer}
      onPress={async () => {
        const fullDetails = await getFullDetails(item);
        navigation.navigate('Detail', { movie: fullDetails });
      }}
    >
      <Image
        source={{ uri: getImageUrl(item.poster_path, 'w342') }}
        style={styles.cardImage}
      />
      <View style={styles.ratingBadge}>
         <Ionicons name="star" size={10} color="#FFD700" />
         <Text style={styles.ratingText}>{item.vote_average?.toFixed(1) || 'NR'}</Text>
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {item.title || item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (!isLoadingMore) return <View style={{ height: 40 }} />;
    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator size="small" color="#E50914" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        
        {/* Filter Button */}
        <TouchableOpacity onPress={() => setShowFilters(true)} style={styles.filterButton}>
          <Feather name="sliders" size={20} color={filters.year || filters.language || filters.rating ? '#E50914' : 'white'} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E50914" />
        </View>
      ) : (
        <FlashList
          data={movies}
          renderItem={renderMovieCard}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          numColumns={3}
          estimatedItemSize={200}
          contentContainerStyle={styles.listContent}
          onEndReached={loadMoreMovies}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      )}

      {/* FILTER MODAL */}
      <Modal visible={showFilters} animationType="slide" transparent={true}>
        <BlurView intensity={80} tint="dark" style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 20 }}>
              {/* Year Filter */}
              <View>
                <Text style={styles.filterSectionTitle}>Release Year</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {years.map(y => (
                    <TouchableOpacity 
                      key={y} 
                      style={[styles.filterChip, filters.year === y && styles.filterChipActive]}
                      onPress={() => setFilters({...filters, year: filters.year === y ? '' : y})}
                    >
                      <Text style={[styles.filterChipText, filters.year === y && styles.filterChipTextActive]}>{y}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Language Filter */}
              <View>
                <Text style={styles.filterSectionTitle}>Language</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {languages.map(lang => (
                    <TouchableOpacity 
                      key={lang.code} 
                      style={[styles.filterChip, filters.language === lang.code && styles.filterChipActive]}
                      onPress={() => setFilters({...filters, language: filters.language === lang.code ? '' : lang.code})}
                    >
                      <Text style={[styles.filterChipText, filters.language === lang.code && styles.filterChipTextActive]}>{lang.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Rating Filter */}
              <View>
                <Text style={styles.filterSectionTitle}>Minimum Rating</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                  {ratings.map(r => (
                    <TouchableOpacity 
                      key={r} 
                      style={[styles.filterChip, filters.rating === r && styles.filterChipActive]}
                      onPress={() => setFilters({...filters, rating: filters.rating === r ? 0 : r})}
                    >
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                         <Ionicons name="star" size={14} color={filters.rating === r ? '#000' : '#FFD700'} />
                         <Text style={[styles.filterChipText, filters.rating === r && styles.filterChipTextActive]}>{r}+</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.resetButton} onPress={resetFilters}>
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#141414' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: (StatusBar.currentHeight || 0) + 10, paddingBottom: 15, paddingHorizontal: 16, backgroundColor: 'rgba(20, 20, 20, 0.95)', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' },
  backButton: { marginRight: 16 },
  title: { flex: 1, color: 'white', fontSize: 20, fontWeight: 'bold' },
  filterButton: { padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 8 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingHorizontal: 8, paddingTop: 16, paddingBottom: 40 },
  cardContainer: { flex: 1 / 3, padding: 6 },
  cardImage: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: '#222' },
  ratingBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.8)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  cardTitle: { color: '#E5E5E5', fontSize: 12, marginTop: 6 },
  footerLoading: { paddingVertical: 20, justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  filterSectionTitle: { color: '#AAA', fontSize: 14, marginBottom: 10, fontWeight: '600' },
  filterRow: { gap: 10, paddingBottom: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#333' },
  filterChipActive: { backgroundColor: 'white', borderColor: 'white' },
  filterChipText: { color: '#DDD', fontSize: 14 },
  filterChipTextActive: { color: '#000', fontWeight: 'bold' },
  modalFooter: { flexDirection: 'row', gap: 12, marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#333' },
  resetButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#2A2A2A', alignItems: 'center' },
  resetText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  applyButton: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: '#E50914', alignItems: 'center' },
  applyText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});

export default ViewAllPage;