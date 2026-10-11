// src/components/shared/MovieCard.tsx
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../tmdb';
import QuickAddButton from './QuickAddButton';
import { EXPLORE_CARD_WIDTH, SEARCH_CARD_WIDTH, GAP_SIZE } from '../explore/ExploreConstants';

interface MovieCardProps {
  item: any;
  onPress: () => void;
  isSearchMode?: boolean;
  isAdded?: boolean;
  toggleWatchlist?: (item: any) => void;
}

const MovieCard = memo(
  ({ item, onPress, isSearchMode = false, isAdded, toggleWatchlist }: MovieCardProps) => {
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
        <View style={[styles.cardContainer, { width: cardWidth, height: cardHeight }]}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={imageUrl}
            />
          ) : (
            <View style={[styles.placeholderCard, { width: cardWidth, height: cardHeight }]}>
              <Ionicons name="film-outline" size={26} color="#555" />
            </View>
          )}

          {/* Quick Add Watchlist Heart */}
          <View style={styles.heartOverlay}>
            <QuickAddButton
              item={item}
              itemId={item.id}
              isAdded={isAdded}
              onPress={toggleWatchlist ? () => toggleWatchlist(item) : undefined}
            />
          </View>

          {/* Rating Badge */}
          {item.vote_average ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFD60A" />
              <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
            </View>
          ) : null}
        </View>

        {/* 2-Line High Density Micro-Metadata */}
        <View style={styles.metaContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || item.name || 'Untitled'}
          </Text>
          <Text style={styles.subtext} numberOfLines={1}>
            {year ? `${year} • ` : ''}
            {mediaType}
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
  cardContainer: {
    borderRadius: 14,
    backgroundColor: '#18181C',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#24242A',
  },
  placeholderCard: {
    backgroundColor: '#18181C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOverlay: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 10,
  },
  ratingBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  ratingText: {
    color: '#FAFAFA',
    fontSize: 10,
    fontWeight: '700',
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