import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCollectionDetails,
  getImageUrl,
  TMDBCollectionDetails,
  TMDBResult,
} from '../../src/tmdb';
import { ShimmerBlock } from '../../src/components/shared/Shimmer';

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

const C = {
  bg: '#0A0A0B',
  surface: '#141416',
  surface2: '#1C1C20',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  white: '#FAFAFA',
  text: '#E8E8EA',
  muted: '#7A7A82',
  mutedSoft: '#9B9BA3',
  gold: '#FFD60A',
  accent: '#C9A9FF',
};

// --- SHIMMER COMPONENTS ---

const MovieCardShimmer = () => (
  <View style={styles.movieCard}>
    <ShimmerBlock width={100} height={150} borderRadius={12} />
    <View style={{ flex: 1, gap: 8, paddingVertical: 4 }}>
      <ShimmerBlock width="65%" height={16} />
      <ShimmerBlock width="30%" height={12} />
      <ShimmerBlock width="100%" height={12} />
      <ShimmerBlock width="80%" height={12} />
    </View>
  </View>
);

// --- MAIN COMPONENT ---

const CollectionDetails = () => {
  const router = useRouter();
  const { id, name } = useLocalSearchParams();
  const collectionId = Number(id);
  const collectionName = (name as string) || '';

  const [collection, setCollection] = useState<TMDBCollectionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [isWatched, setIsWatched] = useState(false);

  const checkStatus = async (col: TMDBCollectionDetails) => {
    try {
      const watchlistStr = await AsyncStorage.getItem('watchlist');
      if (watchlistStr) {
        const list = JSON.parse(watchlistStr);
        setIsInWatchlist(list.some((item: any) => item.id === col.id));
      }
      
      const historyStr = await AsyncStorage.getItem('history');
      if (historyStr) {
        const list = JSON.parse(historyStr);
        setIsWatched(list.some((item: any) => item.id === col.id));
      }
    } catch {}
  };

  useEffect(() => {
    const fetchCollection = async () => {
      setLoading(true);
      const data = await getCollectionDetails(collectionId);
      setCollection(data);
      if (data) checkStatus(data);
      setLoading(false);
    };
    fetchCollection();
  }, [collectionId]);

  const sortedParts = collection?.parts
    ? [...collection.parts].sort((a, b) => {
        const dateA = a.release_date || '';
        const dateB = b.release_date || '';
        return dateA.localeCompare(dateB);
      })
    : [];

  const handleMoviePress = (movie: TMDBResult) => {
    router.push(`/movie/${movie.id}`);
  };

  const toggleWatchlist = async () => {
    if (!collection) return;
    try {
      const stored = await AsyncStorage.getItem('watchlist');
      const list = stored ? JSON.parse(stored) : [];
      const exists = list.some((item: any) => item.id === collection.id);
      const newList = exists ? list.filter((item: any) => item.id !== collection.id) : [...list, collection];
      await AsyncStorage.setItem('watchlist', JSON.stringify(newList));
      setIsInWatchlist(!exists);
    } catch {}
  };

  const toggleWatched = async () => {
    if (!collection) return;
    try {
      const stored = await AsyncStorage.getItem('history');
      const list = stored ? JSON.parse(stored) : [];
      const exists = list.some((item: any) => item.id === collection.id);
      const newList = exists ? list.filter((item: any) => item.id !== collection.id) : [...list, collection];
      await AsyncStorage.setItem('history', JSON.stringify(newList));
      setIsWatched(!exists);
    } catch {}
  };

  const renderMovieItem = ({ item }: { item: TMDBResult }) => {
    const year = item.release_date?.split('-')[0] || '';
    return (
      <TouchableOpacity activeOpacity={0.95}
        style={styles.movieCard}
        onPress={() => handleMoviePress(item)}
        activeOpacity={0.95}
      >
        <Image
          source={{ uri: getImageUrl(item.poster_path, 'w185') }}
          style={styles.moviePoster}
        />
        <View style={styles.movieInfo}>
          <Text style={styles.movieTitle} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          {year ? (
            <Text style={styles.movieYear}>{year}</Text>
          ) : null}
          {item.vote_average > 0 && (
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={11} color={C.gold} />
              <Text style={styles.ratingText}>
                {item.vote_average.toFixed(1)}
              </Text>
            </View>
          )}
          {item.overview ? (
            <Text style={styles.movieOverview} numberOfLines={3}>
              {item.overview}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <>
      {/* Backdrop */}
      <View style={styles.backdropContainer}>
        <Image
          source={{
            uri: getImageUrl(
              collection?.backdrop_path || null,
              'w780'
            ),
          }}
          style={styles.backdropImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(10,10,11,0.1)',
            'transparent',
            'rgba(10,10,11,0.7)',
            C.bg,
          ]}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Content */}
      <View style={styles.contentContainer}>
        <Text style={styles.eyebrow}>COLLECTION</Text>
        <Text style={styles.collectionTitle}>
          {collection?.name || collectionName}
        </Text>
        {collection?.overview ? (
          <Text style={styles.collectionOverview}>
            {collection.overview}
          </Text>
        ) : null}
        <View style={styles.countPill}>
          <Ionicons name="film-outline" size={13} color={C.accent} />
          <Text style={styles.countText}>
            {sortedParts.length} {sortedParts.length === 1 ? 'Film' : 'Films'}
          </Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity activeOpacity={0.95} 
            style={[styles.actionBtn, isInWatchlist && styles.actionBtnActive]} 
            onPress={toggleWatchlist}
          >
            <Feather name={isInWatchlist ? "check" : "bookmark"} size={18} color={isInWatchlist ? "#000" : C.white} />
            <Text style={[styles.actionBtnText, isInWatchlist && { color: "#000" }]}>
              {isInWatchlist ? "Saved" : "Save"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.95} 
            style={[styles.actionBtn, isWatched && styles.actionBtnActive]} 
            onPress={toggleWatched}
          >
            <Feather name={isWatched ? "eye-off" : "eye"} size={18} color={isWatched ? "#000" : C.white} />
            <Text style={[styles.actionBtnText, isWatched && { color: "#000" }]}>
              {isWatched ? "Watched" : "Mark Watched"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No movies found in this collection.</Text>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Back button */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <TouchableOpacity activeOpacity={0.95}
          onPress={() => router.back()}
          style={styles.glassBtn}
          activeOpacity={0.95}
        >
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={() => (
            <>
              <View style={styles.backdropContainer}>
                <ShimmerBlock width="100%" height="100%" borderRadius={0} />
              </View>
              <View style={styles.contentContainer}>
                <ShimmerBlock width={80} height={12} style={{ marginBottom: 10 }} />
                <ShimmerBlock width="70%" height={28} style={{ marginBottom: 12 }} />
                <ShimmerBlock width="100%" height={14} style={{ marginBottom: 6 }} />
                <ShimmerBlock width="85%" height={14} style={{ marginBottom: 20 }} />
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                {[1, 2, 3, 4].map((i) => (
                  <MovieCardShimmer key={i} />
                ))}
              </View>
            </>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={sortedParts}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMovieItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  backdropContainer: {
    height: 280,
    overflow: 'hidden',
  },
  backdropImage: {
    width: '100%',
    height: '100%',
  },

  contentContainer: {
    marginTop: -40,
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
  },

  eyebrow: {
    color: C.mutedSoft,
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 8,
  },
  collectionTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.white,
    lineHeight: 32,
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  collectionOverview: {
    color: C.text,
    fontSize: 14.5,
    lineHeight: 23,
    marginBottom: 16,
  },
  countPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(201,169,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(201,169,255,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    marginBottom: 8,
  },
  countText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
  },

  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface2,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnActive: {
    backgroundColor: C.white,
    borderColor: C.white,
  },
  actionBtnText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
  },

  listContent: {
    paddingBottom: 140,
  },

  movieCard: {
    flexDirection: 'row',
    gap: 14,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  moviePoster: {
    width: 100,
    height: 150,
    borderRadius: 12,
    backgroundColor: C.surface2,
  },
  movieInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  movieTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  movieYear: {
    color: C.mutedSoft,
    fontSize: 12.5,
    fontWeight: '500',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    color: C.mutedSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  movieOverview: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  separator: {
    height: 10,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    color: C.muted,
    fontSize: 14,
    textAlign: 'center',
  },
});

export default CollectionDetails;
