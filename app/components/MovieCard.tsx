import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../src/tmdb';
import QuickAddButton from './QuickAddButton';
import { EXPLORE_CARD_WIDTH, SEARCH_CARD_WIDTH, GAP_SIZE } from './ExploreConstants';

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

  if (!item.poster_path) return <View style={{ width: cardWidth, height: cardHeight, marginRight: GAP_SIZE }} />;

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={onPress}
      style={{ width: cardWidth, marginRight: isSearchMode ? 0 : GAP_SIZE, marginBottom: isSearchMode ? 16 : 0 }}
    >
      <View style={styles.cardContainer}>
        <Image
          source={{ uri: getImageUrl(item.poster_path, 'w185') }}
          style={[styles.sectionImage, { width: cardWidth, height: cardHeight }]}
          resizeMode="cover"
        />
        <View style={styles.cardAddButtonOverlay}>
          <QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item)} />
        </View>
        <View style={styles.cardOverlay}>
          <View style={styles.ratingBadgeSmall}>
            <Ionicons name="star" size={10} color={C.gold} />
            <Text style={styles.ratingTextSmall}>{item.vote_average?.toFixed(1) || 'N/A'}</Text>
          </View>
        </View>
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