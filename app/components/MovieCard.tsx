import React, { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../src/tmdb';
import QuickAddButton from './QuickAddButton';
import { EXPLORE_CARD_WIDTH, SEARCH_CARD_WIDTH, GAP_SIZE } from './ExploreConstants';

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
      activeOpacity={0.7} 
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
            <Ionicons name="star" size={10} color="#FFD700" />
            <Text style={styles.ratingTextSmall}>{item.vote_average?.toFixed(1) || 'N/A'}</Text>
          </View>
        </View>
      </View>
      {isSearchMode && (
        <Text style={styles.sectionItemTitle} numberOfLines={2}>{item.title || item.name}</Text>
      )}
    </TouchableOpacity>
  );
});

export default MovieCard;

const styles = StyleSheet.create({
  cardContainer: { position: 'relative'
    
  },
  sectionImage: { 
    borderRadius: 5, 
    backgroundColor: '#1A1A1A' 
  },
  cardAddButtonOverlay: { 
    position: 'absolute', 
    top: 6, 
    right: 6, 
    zIndex: 10 
  },
  cardOverlay: { 
    position: 'absolute', 
    bottom: 8, 
    left: 8 
  },
  ratingBadgeSmall: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.8)', 
    paddingHorizontal: 6, 
    paddingVertical: 4, 
    borderRadius: 6, 
    gap: 3 
  },
  ratingTextSmall: { 
    color: '#FFFFFF', 
    fontSize: 11, 
    fontFamily: 'GoogleSansFlex-Bold' 
  },
  sectionItemTitle: { 
    color: '#DDD', 
    fontSize: 13.5, 
    marginTop: 8, 
    lineHeight: 18, 
    fontFamily: 'GoogleSansFlex-Regular' 
  },
});