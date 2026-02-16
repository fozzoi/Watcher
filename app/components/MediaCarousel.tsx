import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { getFullDetails } from '../../src/tmdb';
import MovieCard from './MovieCard';
import { EXPLORE_CARD_WIDTH, GAP_SIZE, HORIZONTAL_MARGIN } from './ExploreConstants';

interface MediaCarouselProps {
  title: string;
  data: any[];
  navigation: any;
  savedIds: Set<number>;
  toggleWatchlist: (item: any) => void;
}

const MediaCarousel = memo(({ title, data, navigation, savedIds, toggleWatchlist }: MediaCarouselProps) => {
  if (!data || data.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: HORIZONTAL_MARGIN }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('ViewAll', { title, data })}>
          <MaterialIcons name="chevron-right" size={24} color="#8C8C8C" />
        </TouchableOpacity>
      </View>
      <FlashList
        horizontal
        data={data}
        estimatedItemSize={EXPLORE_CARD_WIDTH + GAP_SIZE}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_MARGIN }}
        removeClippedSubviews={true}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        renderItem={({ item }) => (
          <MovieCard 
            item={item} 
            isAdded={savedIds.has(item.id)} 
            toggleWatchlist={toggleWatchlist} 
            onPress={async () => {
              const fullDetails = await getFullDetails(item);
              navigation.navigate('Detail', { movie: fullDetails });
            }} 
          />
        )}
      />
    </View>
  );
});

export default MediaCarousel;

const styles = StyleSheet.create({
  sectionContainer: { paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#FFFFFF', fontSize: 21, fontFamily: 'GoogleSansFlex-Bold' },
});