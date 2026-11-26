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

    // Limit horizontal shelf items to top 10 to keep memory footprint lean and scrolls buttery-smooth
    const validData = useMemo(() => {
      if (!Array.isArray(data)) return [];
      const filtered = data.filter((item: any) => Boolean(item && item.id && (item.poster_path || item.backdrop_path)));
      return filtered.slice(0, 10);
    }, [data]);

    const handleViewAll = useCallback(() => {
      router.push(`/viewall?title=${encodeURIComponent(title)}&type=${encodeURIComponent(type || '')}`);
    }, [router, title, type]);

    const handleCardPress = useCallback(
      (item: any) => {
        warmPaletteForMedia(item);
        if (item.media_type === 'collection' || item.collection_id) {
          const colId = item.collection_id || item.id;
          const colName = item.title || item.name || '';
          router.push(`/collection/${colId}?name=${encodeURIComponent(colName)}&title=${encodeURIComponent(colName)}`);
          return;
        }
        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        router.push({
          pathname: `/movie/${item.id}`,
          params: {
            media_type: mediaType,
            title: item.title || item.name || '',
            poster_path: item.poster_path || '',
            backdrop_path: item.backdrop_path || '',
            overview: item.overview || '',
            release_date: item.release_date || item.first_air_date || '',
            vote_average: item.vote_average ? String(item.vote_average) : '',
          },
        });
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
          <Text
            style={[styles.sectionTitle, { color: colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
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
    // Rounds the section's own edge to the same 14dp as MovieCard, so a card
    // sliding past the screen boundary curves instead of cutting square.
    borderRadius: 14,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  sectionTitle: {
    flex: 1,
    flexShrink: 1,
    marginRight: 12,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  viewAllBtn: {
    flexShrink: 0,
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