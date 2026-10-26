// src/components/shared/MovieCard.tsx
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../tmdb';
import QuickAddButton from './QuickAddButton';
import { EXPLORE_CARD_WIDTH, SEARCH_CARD_WIDTH, GAP_SIZE } from '../explore/ExploreConstants';
import { useAppTheme, shadows } from '../../theme';

interface MovieCardProps {
  item: any;
  onPress: () => void;
  isSearchMode?: boolean;
  isAdded?: boolean;
  toggleWatchlist?: (item: any) => void;
}

const MovieCard = memo(
  ({ item, onPress, isSearchMode = false, isAdded, toggleWatchlist }: MovieCardProps) => {
    const { colors, isDark } = useAppTheme();
    if (!item || !item.id) return null;

    const cardWidth = isSearchMode ? SEARCH_CARD_WIDTH : EXPLORE_CARD_WIDTH;
    const cardHeight = cardWidth * 1.5;
    const imagePath = item.poster_path || item.backdrop_path;
    const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const mediaType = item.media_type === 'tv' || item.first_air_date ? 'Series' : 'Movie';

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={{
          width: cardWidth,
          marginRight: isSearchMode ? 0 : GAP_SIZE,
          marginBottom: isSearchMode ? 16 : 0,
        }}
      >
        <View style={[styles.cardShadow, { width: cardWidth, height: cardHeight, backgroundColor: colors.surfaceContainer }]}>
          <View style={[styles.cardContainer, { width: cardWidth, height: cardHeight, backgroundColor: colors.surfaceContainer }]}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={imageUrl}
              />
            ) : (
              <View style={[styles.placeholderCard, { width: cardWidth, height: cardHeight, backgroundColor: colors.surfaceContainer }]}>
                <Ionicons name="film-outline" size={26} color={colors.textSecondary} />
              </View>
            )}

            {/* Quick Add Watchlist Heart — bare, top-right */}
            <View style={styles.heartOverlay}>
              <QuickAddButton
                item={item}
                itemId={item.id}
                isAdded={isAdded}
                plain
                onPress={toggleWatchlist ? () => toggleWatchlist(item) : undefined}
              />
            </View>

            {/* Rating — anchored to the poster bottom */}
            {item.vote_average ? (
              <View
                style={[
                  styles.ratingChip,
                  {
                    backgroundColor: isDark ? 'rgba(10, 10, 12, 0.72)' : 'rgba(255, 255, 255, 0.92)',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)',
                  },
                ]}
              >
                <Ionicons name="star" size={11} color={isDark ? '#FFD60A' : '#E6A700'} />
                <Text style={[styles.ratingText, { color: colors.text }]}>
                  {item.vote_average.toFixed(1)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 2-Line High Density Micro-Metadata */}
        <View style={styles.metaContainer}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {item.title || item.name || 'Untitled'}
          </Text>
          <Text style={[styles.subtext, { color: colors.textSecondary }]} numberOfLines={1}>
            {year ? `${year} ` : ''}
            {/* {mediaType} */}
          </Text>
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.isAdded === next.isAdded &&
    prev.isSearchMode === next.isSearchMode
);

export default MovieCard;

const styles = StyleSheet.create({
  cardShadow: {
    borderRadius: 14,
    ...shadows.md,
  },
  cardContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  placeholderCard: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  ratingChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    filter: [
      { dropShadow: { offsetX: 0, offsetY: 1, standardDeviation: 3, color: 'rgba(0, 0, 0, 0.35)' } },
    ],
  },
  ratingText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  metaContainer: {
    marginTop: 8,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtext: {
    color: '#9B9BA3',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});