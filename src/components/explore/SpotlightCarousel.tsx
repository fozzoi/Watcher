// src/components/explore/SpotlightCarousel.tsx
import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LegendList } from '@legendapp/list/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl, getMovieCollectionInfo } from '../../tmdb';
import { HORIZONTAL_MARGIN } from './ExploreConstants';

const SPOTLIGHT_WIDTH = 280;
const SPOTLIGHT_HEIGHT = 158;
const GAP = 12;
const SNAP_INTERVAL = SPOTLIGHT_WIDTH + GAP;

interface SpotlightCarouselProps {
  title?: string;
  eyebrow?: string;
  data: any[];
  onExploreAll?: () => void;
}

const SpotlightCard = memo(
  ({ item, eyebrow, onPress }: { item: any; eyebrow?: string; onPress: () => void }) => {
    const backdropPath = item.backdrop_path || item.poster_path;
    const imageUrl = backdropPath ? getImageUrl(backdropPath, 'w780') : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.cardContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={imageUrl}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
            <Ionicons name="film-outline" size={32} color="#444" />
          </View>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(10, 10, 11, 0.4)', 'rgba(10, 10, 11, 0.95)']}
          locations={[0.2, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.contentOverlay}>
          <Text style={styles.eyebrowText}>
            {eyebrow || 'COLLECTION SPOTLIGHT'}
          </Text>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.collection_name || item.belongs_to_collection?.name || item.title || item.name}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.collection_name && item.title ? `${item.title} • ` : (year ? `${year} • ` : '')}
            {item.vote_average ? `★ ${item.vote_average.toFixed(1)} Rating` : 'Curated Collection'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

const SpotlightCarousel = memo(({ title = 'Franchise Spotlight', eyebrow, data, onExploreAll }: SpotlightCarouselProps) => {
  const router = useRouter();

  const validData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item) => Boolean(item && (item.backdrop_path || item.poster_path)));
  }, [data]);

  // Navigate to collection details page (or movie details if not in a collection)
  const handlePress = useCallback(
    async (item: any) => {
      let collectionId = item.collection_id || item.belongs_to_collection?.id || item._colId;
      let collectionName = item.collection_name || item.belongs_to_collection?.name || item._colName;

      // Resilient fallback: fetch collection info if collection id wasn't attached
      if (!collectionId && item.id) {
        try {
          const colInfo = await getMovieCollectionInfo(item.id);
          if (colInfo?.id) {
            collectionId = colInfo.id;
            collectionName = colInfo.name || collectionName;
          }
        } catch {
          // non-blocking
        }
      }

      if (collectionId) {
        const titleToPass = collectionName || item.title || item.name || '';
        router.push(`/collection/${collectionId}?name=${encodeURIComponent(titleToPass)}&title=${encodeURIComponent(titleToPass)}`);
      } else if (item.id) {
        router.push(`/movie/${item.id}`);
      }
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <SpotlightCard item={item} eyebrow={eyebrow} onPress={() => handlePress(item)} />
    ),
    [eyebrow, handlePress]
  );

  if (!validData.length) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {onExploreAll ? (
          <TouchableOpacity activeOpacity={0.8} onPress={onExploreAll} style={styles.exploreAllBtn}>
            <Text style={styles.exploreAllText}>EXPLORE ALL</Text>
            <Ionicons name="chevron-forward" size={14} color="#E50914" />
          </TouchableOpacity>
        ) : null}
      </View>

      <LegendList
        horizontal
        data={validData}
        keyExtractor={(item) => `spotlight-${item.id}`}
        renderItem={renderItem}
        recycleItems={true}
        estimatedItemSize={SNAP_INTERVAL}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
      />
    </View>
  );
});

export default SpotlightCarousel;

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FAFAFA',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  exploreAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  exploreAllText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  cardContainer: {
    width: SPOTLIGHT_WIDTH,
    height: SPOTLIGHT_HEIGHT,
    borderRadius: 16,
    backgroundColor: '#161618',
    overflow: 'hidden',
    marginRight: GAP,
    borderWidth: 1,
    borderColor: '#24242A',
    position: 'relative',
  },
  placeholder: {
    backgroundColor: '#18181C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
  },
  eyebrowText: {
    color: '#E50914',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  cardTitle: {
    color: '#FAFAFA',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    color: '#9B9BA3',
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 2,
  },
});