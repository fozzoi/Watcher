import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { getFullDetails } from '../../tmdb';
import MovieCard from './MovieCard';
import { EXPLORE_CARD_WIDTH, GAP_SIZE, HORIZONTAL_MARGIN } from '../explore/ExploreConstants';

// Shared design system — kept in sync with DetailPage.tsx / CastDetails.tsx / MovieCard.tsx
const C = {
  white: '#FAFAFA',
  mutedSoft: '#9B9BA3',
};

interface MediaCarouselProps {
  title: string;
  type?: string;
  data: any[];
  savedIds: Set<number>;
  toggleWatchlist: (item: any) => void;
}

const CarouselMovieCard = memo(({ item, isAdded, toggleWatchlist }: {
  item: any;
  isAdded: boolean;
  toggleWatchlist: (item: any) => void;
}) => {
  const router = useRouter();
  const handlePress = useCallback(() => {
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${item.id}?media_type=${mediaType}`);
  }, [item, router]);

  return (
    <MovieCard
      item={item}
      isAdded={isAdded}
      toggleWatchlist={toggleWatchlist}
      onPress={handlePress}
    />
  );
});

const MediaCarousel = memo(({ title, type, data, savedIds, toggleWatchlist }: MediaCarouselProps) => {
  const router = useRouter();

  // Filter out any null, corrupted, or poster-less items so no empty gaps appear between cards
  const validData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return data.filter((item: any) => Boolean(item && item.id && (item.poster_path || item.backdrop_path)));
  }, [data]);

  if (!validData || validData.length === 0) return null;

  const SNAP_INTERVAL = EXPLORE_CARD_WIDTH + GAP_SIZE;

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: HORIZONTAL_MARGIN }]}>
        <Text style={styles.sectionTitle}>{title}</Text>

        <TouchableOpacity activeOpacity={0.95} onPress={() => router.push(`/viewall?title=${encodeURIComponent(title)}&type=${encodeURIComponent(type || '')}`)}>
          <MaterialIcons name="chevron-right" size={24} color={C.mutedSoft} />
        </TouchableOpacity>
      </View>
      <FlashList
        horizontal
        data={validData}
        showsHorizontalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_MARGIN }}
        removeClippedSubviews={false}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        decelerationRate="fast"
        renderItem={({ item }) => (
          <CarouselMovieCard
            item={item}
            isAdded={savedIds.has(item.id)}
            toggleWatchlist={toggleWatchlist}
          />
        )}
      />
    </View>
  );
});

export default MediaCarousel;

const styles = StyleSheet.create({
  sectionContainer: { paddingBottom: 24, borderRadius: 14, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: C.white, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
});

