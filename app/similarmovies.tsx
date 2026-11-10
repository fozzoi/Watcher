import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  FlatList,
  Image,
  TouchableOpacity,
} from 'react-native';
import { LoadingIndicator } from '../src/components/shared/LoadingIndicator';
import { Text } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSimilarMedia, getImageUrl, TMDBResult } from '../src/tmdb';
import { useAppTheme } from '../src/theme';
import { warmPaletteForMedia } from '../src/utils/colorExtractor';

const { width, height } = Dimensions.get('window');

const SimilarMoviesPage = () => {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const { id: paramId, type: paramType, name: paramName } = useLocalSearchParams();
  const title = paramName as string;
  const movieId = Number(paramId);
  const mediaType = paramType as 'movie' | 'tv';

  const [movies, setMovies] = useState<TMDBResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMorePages, setHasMorePages] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const fetchReqIdRef = useRef(0);

  const fetchSimilarMovies = useCallback(async (pageNum = 1, refresh = false) => {
    const reqId = ++fetchReqIdRef.current;
    const isInitialOrRefresh = refresh || pageNum === 1;
    if (isInitialOrRefresh) {
      if (!refresh) setIsLoading(true);
      setError(null);
      setLoadMoreError(false);
    } else {
      setIsLoadingMore(true);
      setLoadMoreError(false);
    }

    try {
      const results = await getSimilarMedia(movieId, mediaType, pageNum, {
        priority: 'high',
        throwOnError: true,
      });

      if (reqId !== fetchReqIdRef.current) return;

      if (results.length === 0) {
        if (isInitialOrRefresh) setMovies([]);
        setHasMorePages(false);
      } else {
        setMovies(prevMovies => {
          if (isInitialOrRefresh) return results;
          const existingIds = new Set(prevMovies.map(m => m.id));
          return [...prevMovies, ...results.filter(m => !existingIds.has(m.id))];
        });
        setPage(pageNum);
        setHasMorePages(true);
      }
    } catch (err) {
      if (reqId !== fetchReqIdRef.current) return;
      console.error('Error fetching similar movies:', err);
      if (isInitialOrRefresh) {
        setError('Could not load similar titles. Check your connection and try again.');
      } else {
        setLoadMoreError(true);
      }
    } finally {
      if (reqId === fetchReqIdRef.current) {
        setIsLoading(false);
        setIsLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [movieId, mediaType]);

  const handleLoadMore = () => {
    if (!isLoading && !isLoadingMore && hasMorePages && !loadMoreError) {
      const nextPage = page + 1;
      fetchSimilarMovies(nextPage);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setPage(1);
    setHasMorePages(true);
    setError(null);
    setLoadMoreError(false);
    fetchSimilarMovies(1, true);
  };

  useEffect(() => {
    fetchSimilarMovies(1, false);
    return () => {
      fetchReqIdRef.current += 1;
    };
  }, [fetchSimilarMovies]);

  const renderMovieItem = ({ item }: { item: TMDBResult }) => (
    <TouchableOpacity activeOpacity={0.95}
      style={styles.movieItem}
      onPress={() => {
        warmPaletteForMedia(item);
        const mType = item.media_type || mediaType || (item.first_air_date ? 'tv' : 'movie');
        router.push(`/movie/${item.id}?media_type=${mType}`);
      }}
    >
      <Image
        source={{ uri: getImageUrl(item.poster_path, 'w342') }}
        style={[styles.poster, { backgroundColor: colors.surfaceContainer }]}
      />
      <View style={styles.movieInfo}>
        <Text style={[styles.movieTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title || item.name}
        </Text>
        <Text style={[styles.movieYear, { color: colors.textSecondary }]}>
          {(item.release_date || item.first_air_date)?.split('-')[0] || 'N/A'}
        </Text>
        <View style={styles.ratingContainer}>
          <Ionicons name="star" size={14} color="#FFD60A" />
          <Text style={[styles.rating, { color: colors.textSecondary }]}>
            {typeof item.vote_average === 'number' ? item.vote_average.toFixed(1) : 'NR'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (loadMoreError) {
      return (
        <View style={styles.footer}>
          <Text style={[styles.footerErrorText, { color: colors.textSecondary }]}>
            Could not load more titles
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchSimilarMovies(page + 1)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={14} color={colors.onPrimary} />
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <LoadingIndicator size="large" color={colors.primary} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <LoadingIndicator size="large" color={colors.primary} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-offline-outline" size={44} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Could not load titles</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => fetchSimilarMovies(1, false)}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh" size={16} color={colors.onPrimary} />
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No similar titles found</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header with back button */}
      <View style={[styles.header, { backgroundColor: colors.surfaceContainer }]}>
        <TouchableOpacity activeOpacity={0.95}
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Movie list */}
      <FlatList
        data={movies}
        keyExtractor={(item) => `movie-${item.id}`}
        renderItem={renderMovieItem}
        numColumns={3}
        contentContainerStyle={styles.list}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#141414',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: '#161616',
    elevation: 4,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: width * 0.045,
    fontWeight: 'bold',
    fontFamily: 'GoogleSansFlex-Bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  list: {
    padding: 12,
    paddingBottom: 50,
  },
  movieItem: {
    width: (width - 48) / 3,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  poster: {
    width: '100%',
    height: (width - 48) / 3 * 1.5,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  movieInfo: {
    marginTop: 6,
  },
  movieTitle: {
    color: '#fff',
    fontSize: width * 0.035,
    fontWeight: '600',
    fontFamily: 'GoogleSansFlex-Medium',
  },
  movieYear: {
    color: '#aaa',
    fontSize: width * 0.03,
    fontFamily: 'GoogleSansFlex-Regular',
    marginVertical: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rating: {
    color: '#aaa',
    fontSize: width * 0.03,
    fontFamily: 'GoogleSansFlex-Regular',
    marginLeft: 4,
  },
  footer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#aaa',
    fontSize: width * 0.04,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  footerErrorText: {
    fontSize: 13,
    marginBottom: 8,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default SimilarMoviesPage;