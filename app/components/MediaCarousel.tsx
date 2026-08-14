import React, { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { MaterialIcons } from '@expo/vector-icons';
import { getFullDetails } from '../../src/tmdb';
import MovieCard from './MovieCard';
import { EXPLORE_CARD_WIDTH, GAP_SIZE, HORIZONTAL_MARGIN } from './ExploreConstants';

// Shared design system — kept in sync with DetailPage.tsx / CastDetails.tsx / MovieCard.tsx
const C = {
  white: '#FAFAFA',
  mutedSoft: '#9B9BA3',
};

interface MediaCarouselProps {
  title: string;
  type?: string; // ✅ FIX 1: Added type to the interface
  data: any[];
  navigation: any;
  savedIds: Set<number>;
  toggleWatchlist: (item: any) => void;
}

// ✅ FIX 2: Destructured 'type' from the props
const MediaCarousel = memo(({ title, type, data, navigation, savedIds, toggleWatchlist }: MediaCarouselProps) => {
  if (!data || data.length === 0) return null;

  const SNAP_INTERVAL = EXPLORE_CARD_WIDTH + GAP_SIZE;

  return (
    <View style={styles.sectionContainer}>
      <View style={[styles.sectionHeader, { paddingHorizontal: HORIZONTAL_MARGIN }]}>
        <Text style={styles.sectionTitle}>{title}</Text>

        {/* ✅ FIX 3: Passed 'type' into the ViewAll navigation params */}
        <TouchableOpacity activeOpacity={0.95} onPress={() => navigation.navigate('ViewAll', { title, data, type })}>
          <MaterialIcons name="chevron-right" size={24} color={C.mutedSoft} />
        </TouchableOpacity>
      </View>
      <FlashList
        horizontal
        data={data}
        estimatedItemSize={SNAP_INTERVAL}
        showsHorizontalScrollIndicator={false}
        bounces={true}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_MARGIN }}
        removeClippedSubviews={true}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        decelerationRate="fast"
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
  sectionContainer: { paddingBottom: 24, borderRadius: 14, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: C.white, fontSize: 21, fontWeight: '800', letterSpacing: -0.4 },
});