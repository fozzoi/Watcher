import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LegendList } from '@legendapp/list/react-native';
import { MaterialIcons } from '@expo/vector-icons';
import MovieCard from './MovieCard';
import { EXPLORE_CARD_WIDTH, GAP_SIZE, HORIZONTAL_MARGIN } from '../explore/ExploreConstants';
import { useAppTheme } from '../../theme';

const C = {
  white: '#FAFAFA',
  mutedSoft: '#9B9BA3',
};

const SNAP_INTERVAL = EXPLORE_CARD_WIDTH + GAP_SIZE;

interface MediaCarouselProps {
  title: string;
  type?: string;
  data: any[];
  savedIds?: Set<number>;
  toggleWatchlist: (item: any) => void;
}

const MediaCarousel = memo(
  ({ title, type, data, toggleWatchlist }: MediaCarouselProps) => {
    const router = useRouter();
    const { colors } = useAppTheme();

    // Limit horizontal shelf items to top 15 to prevent memory bloat and excessive off-screen render
    const validData = useMemo(() => {
      if (!Array.isArray(data)) return [];
      const filtered = data.filter((item: any) => Boolean(item && item.id && (item.poster_path || item.backdrop_path)));
      return filtered.slice(0, 15);
    }, [data]);

    const handleViewAll = useCallback(() => {
      router.push(`/viewall?title=${encodeURIComponent(title)}&type=${encodeURIComponent(type || '')}`);
    }, [router, title, type]);

    const handleCardPress = useCallback(
      (item: any) => {
        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        router.push(`/movie/${item.id}?media_type=${mediaType}`);
      },
      [router]
    );

    // Stable renderItem: QuickAddButton handles its own reactive watchlist state,
    // avoiding re-creating renderItem or re-rendering cards on global watchlist changes.
    const renderItem = useCallback(
      ({ item }: { item: any }) => (
        <MovieCard
          item={item}
          toggleWatchlist={toggleWatchlist}
          onPress={() => handleCardPress(item)}
        />
      ),
      [toggleWatchlist, handleCardPress]
    );

    if (!validData || validData.length === 0) return null;

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          <TouchableOpacity activeOpacity={0.8} onPress={handleViewAll}>
            <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <LegendList
          horizontal
          data={validData}
          recycleItems={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyExtractor={(item) => String(item.id)}
          snapToInterval={SNAP_INTERVAL}
          snapToAlignment="start"
          decelerationRate="fast"
          getFixedItemSize={() => SNAP_INTERVAL}
          estimatedItemSize={SNAP_INTERVAL}
          drawDistance={150}
          renderItem={renderItem}
        />
      </View>
    );
  },
  (prev, next) =>
    prev.title === next.title &&
    prev.type === next.type &&
    prev.data === next.data
);

export default MediaCarousel;

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  sectionTitle: {
    color: C.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 6,
    minHeight: 260,
  },
});