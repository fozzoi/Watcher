import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LegendList } from '@legendapp/list/react-native';
import { MaterialIcons } from '@expo/vector-icons';
import MovieCard from './MovieCard';
import { EXPLORE_CARD_WIDTH, GAP_SIZE, HORIZONTAL_MARGIN } from '../explore/ExploreConstants';
import { useAppTheme } from '../../theme';
import { warmPaletteForMedia } from '../../utils/colorExtractor';

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
        warmPaletteForMedia(item);
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
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleViewAll}
            style={styles.viewAllBtn}
            hitSlop={{ top: 8, bottom: 8, left: 10, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`View all ${title}`}
          >
            <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>View all</Text>
            <MaterialIcons name="chevron-right" size={18} color={colors.textSecondary} />
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
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
    marginRight: 2,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 6,
    minHeight: 260,
  },
});