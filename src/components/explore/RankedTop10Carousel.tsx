// src/components/explore/RankedTop10Carousel.tsx
import React, { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LegendList } from '@legendapp/list/react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../tmdb';
import QuickAddButton from '../shared/QuickAddButton';
import { HORIZONTAL_MARGIN } from './ExploreConstants';

const CARD_WIDTH = 135;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const GAP = 12;
const ITEM_WIDTH = CARD_WIDTH + GAP;

interface RankedTop10CarouselProps {
  data: any[];
  savedIds?: Set<number>;
  toggleWatchlist: (item: any) => void;
}

const OutlinedNumeral = memo(({ rank }: { rank: number }) => (
  <View style={styles.numeralContainer} pointerEvents="none">
    {/* 4-way micro-offsets simulate a crisp 1.5px outer stroke */}
    <Text style={[styles.numeralBase, styles.numeralStroke, { top: -1.5, left: -1.5 }]}>{rank}</Text>
    <Text style={[styles.numeralBase, styles.numeralStroke, { top: -1.5, left: 1.5 }]}>{rank}</Text>
    <Text style={[styles.numeralBase, styles.numeralStroke, { top: 1.5, left: -1.5 }]}>{rank}</Text>
    <Text style={[styles.numeralBase, styles.numeralStroke, { top: 1.5, left: 1.5 }]}>{rank}</Text>
    {/* Dark hollow interior */}
    <Text style={[styles.numeralBase, styles.numeralFill]}>{rank}</Text>
  </View>
));

const RankedCard = memo(
  ({
    item,
    rank,
    isAdded,
    onPress,
    toggleWatchlist,
  }: {
    item: any;
    rank: number;
    isAdded: boolean;
    onPress: () => void;
    toggleWatchlist: (item: any) => void;
  }) => {
    const imagePath = item.poster_path || item.backdrop_path;
    const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.cardWrapper}>
        <View style={styles.posterBox}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="disk"
              recyclingKey={imageUrl}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
              <Ionicons name="film-outline" size={24} color="#555" />
            </View>
          )}

          {/* Quick-Add Heart */}
          <View style={styles.heartOverlay}>
            <QuickAddButton
              item={item}
              itemId={item.id}
              isAdded={isAdded}
              onPress={() => toggleWatchlist(item)}
            />
          </View>

          {/* Rating Badge */}
          {rating && (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFD60A" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
          )}

          {/* Pure React Native Outlined Numeral on Card Surface */}
          <OutlinedNumeral rank={rank} />
        </View>

        {/* Title and Metadata below the card */}
        <View style={styles.metaContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title || item.name}
          </Text>
          <Text style={styles.subtext} numberOfLines={1}>
            {year ? `${year} • ` : ''}Top {rank}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
);

const RankedTop10Carousel = memo(
  ({ data, savedIds, toggleWatchlist }: RankedTop10CarouselProps) => {
    const router = useRouter();

    const top10Data = useMemo(() => {
      if (!Array.isArray(data)) return [];
      return data.slice(0, 10);
    }, [data]);

    const handlePress = useCallback(
      (item: any) => {
        const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        router.push(`/movie/${item.id}?media_type=${mediaType}`);
      },
      [router]
    );

    const renderItem = useCallback(
      ({ item, index }: { item: any; index: number }) => (
        <RankedCard
          item={item}
          rank={index + 1}
          isAdded={savedIds ? savedIds.has(Number(item.id)) : false}
          onPress={() => handlePress(item)}
          toggleWatchlist={toggleWatchlist}
        />
      ),
      [savedIds, handlePress, toggleWatchlist]
    );

    if (!top10Data.length) return null;

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.headerRow}>
          <View style={styles.titleGroup}>
            <Text style={styles.sectionTitle}>Top 10 Today</Text>
            <View style={styles.liveBadge}>
              <Text style={styles.liveBadgeText}>UPDATED HOURLY</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9B9BA3" />
        </View>

        <LegendList
          horizontal
          data={top10Data}
          keyExtractor={(item) => `ranked-${item.id}`}
          renderItem={renderItem}
          recycleItems={true}
          estimatedItemSize={ITEM_WIDTH}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          decelerationRate="fast"
          snapToInterval={ITEM_WIDTH}
        />
      </View>
    );
  }
);

export default RankedTop10Carousel;

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 12,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: '#FAFAFA',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  liveBadge: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: '#E50914',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    marginRight: GAP,
  },
  posterBox: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#18181C',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#24242A',
    position: 'relative',
  },
  placeholder: {
    backgroundColor: '#161618',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 10.5,
    fontWeight: '700',
  },
  numeralContainer: {
    position: 'absolute',
    left: 4,
    bottom: -8,
    width: 60,
    height: 75,
    zIndex: 5,
  },
  numeralBase: {
    position: 'absolute',
    fontSize: 72,
    fontWeight: '900',
    fontFamily: 'System',
    includeFontPadding: false,
  },
  numeralStroke: {
    color: '#ffffff84',
  },
  numeralFill: {
    top: 0,
    left: 0,
    color: 'rgba(1, 0, 0, 0.97)',
  },
  metaContainer: {
    marginTop: 8,
  },
  title: {
    color: '#FAFAFA',
    fontSize: 13,
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