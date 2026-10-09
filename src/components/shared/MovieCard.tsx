import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../tmdb';
import QuickAddButton from './QuickAddButton';
import { EXPLORE_CARD_WIDTH, SEARCH_CARD_WIDTH, GAP_SIZE } from '../explore/ExploreConstants';

// Shared design system — kept in sync with DetailPage.tsx / CastDetails.tsx
const C = {
  surface2: '#1C1C20',
  white: '#FAFAFA',
  text: '#E8E8EA',
  mutedSoft: '#9B9BA3',
  gold: '#FFD60A',
};

interface MovieCardProps {
  item: any;
  onPress: () => void;
  isSearchMode?: boolean;
  isAdded: boolean;
  toggleWatchlist: (item: any) => void;
}

const MovieCard = memo(({ item, onPress, isSearchMode = false, isAdded, toggleWatchlist }: MovieCardProps) => {
  const cardWidth = isSearchMode ? SEARCH_CARD_WIDTH : EXPLORE_CARD_WIDTH;
  const cardHeight = cardWidth * 1.5;

  if (!item || !item.id) return null;

  const imagePath = item.poster_path || item.backdrop_path;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={{ width: cardWidth, marginRight: isSearchMode ? 0 : GAP_SIZE, marginBottom: isSearchMode ? 16 : 0 }}
    >
      <View style={styles.cardContainer}>
        {imagePath ? (
          <Image
            source={{ uri: getImageUrl(imagePath, 'w342') }}
            style={[styles.sectionImage, { width: cardWidth, height: cardHeight }]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.placeholderCard, { width: cardWidth, height: cardHeight }]}>
            <Ionicons name="film-outline" size={28} color={C.mutedSoft} />
            <Text style={styles.placeholderTitle} numberOfLines={2}>
              {item.title || item.name || 'Untitled'}
            </Text>
          </View>
        )}
        <View style={styles.cardAddButtonOverlay}>
          <QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item)} />
        </View>
        {item.vote_average ? (
          <View style={styles.cardOverlay}>
            <View style={styles.ratingBadgeSmall}>
              <Ionicons name="star" size={10} color={C.gold} />
              <Text style={styles.ratingTextSmall}>{item.vote_average.toFixed(1)}</Text>
            </View>
          </View>
        ) : null}
      </View>
      {isSearchMode && (
        <Text style={styles.sectionItemTitle} numberOfLines={2}>
          {item.title || item.name}
        </Text>
      )}
    </TouchableOpacity>
  );
});

export default MovieCard;

const styles = StyleSheet.create({
  cardContainer: { position: 'relative' },
  sectionImage: {
    borderRadius: 12,
    backgroundColor: C.surface2,
  },
  placeholderCard: {
    borderRadius: 12,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  placeholderTitle: {
    color: C.mutedSoft,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
  },
  cardAddButtonOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  cardOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  ratingBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  ratingTextSmall: {
    color: C.white,
    fontSize: 10,
    fontWeight: '700',
  },
  sectionItemTitle: {
    color: C.text,
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 8,
    lineHeight: 16,
  },
});
