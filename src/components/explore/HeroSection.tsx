import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Dimensions, 
  Platform, 
  ImageSourcePropType 
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useAnimatedScrollHandler,
  interpolate, 
  Extrapolation,
  runOnJS,
  SharedValue
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getImageUrl, TMDBResult } from '../../tmdb';
import QuickAddButton from '../shared/QuickAddButton';
import { HERO_HEIGHT, HORIZONTAL_MARGIN } from './ExploreConstants';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - HORIZONTAL_MARGIN * 2;
const PARALLAX_FACTOR = 0.22;
const AUTOPLAY_INTERVAL = 4500;

// ── Single Hero Slide with Parallax ──────────────────────────────────────────
interface HeroSlideProps {
  item: TMDBResult;
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  cardHeight: number;
  isAdded: boolean;
  onToggleWatchlist: (item: TMDBResult) => void;
  onPress: (item: TMDBResult) => void;
}

const HeroSlide = memo(({
  item,
  index,
  scrollX,
  cardWidth,
  cardHeight,
  isAdded,
  onToggleWatchlist,
  onPress,
}: HeroSlideProps) => {
  const inputRange = [
    (index - 1) * cardWidth,
    index * cardWidth,
    (index + 1) * cardWidth,
  ];

  // Fluid parallax image translation
  const imageAnimatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      scrollX.value,
      inputRange,
      [-cardWidth * PARALLAX_FACTOR, 0, cardWidth * PARALLAX_FACTOR],
      Extrapolation.CLAMP
    );
    const scale = interpolate(
      scrollX.value,
      inputRange,
      [1.08, 1, 1.08],
      Extrapolation.CLAMP
    );
    return {
      transform: [{ translateX }, { scale }],
    };
  });

  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').substring(0, 4);
  const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
  const posterUri = getImageUrl(item.poster_path, 'w780');

  return (
    <View style={[styles.slideContainer, { width: cardWidth, height: cardHeight }]}>
      {/* Background Image with Parallax Mask */}
      <View style={[styles.imageMask, { width: cardWidth, height: cardHeight }]}>
        <Animated.Image
          source={{ uri: posterUri }}
          style={[
            styles.parallaxImage,
            {
              width: cardWidth * (1 + PARALLAX_FACTOR * 2),
              height: cardHeight,
            },
            imageAnimatedStyle,
          ]}
          contentFit="cover"
        />
      </View>

      {/* Interactive Overlay */}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => onPress(item)}
        style={StyleSheet.absoluteFill}
      >
        {/* Quick Add Button */}
        <View style={styles.addBtn}>
          <QuickAddButton isAdded={isAdded} onPress={() => onToggleWatchlist(item)} />
        </View>

        {/* Cinematic Bottom Gradient + Text Details */}
        <LinearGradient
          colors={['transparent', 'rgba(10,10,10,0.45)', 'rgba(10,10,10,0.96)']}
          locations={[0, 0.45, 1]}
          style={styles.gradient}
        >
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.metaRow}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={13} color="#FFD700" />
              <Text style={styles.ratingText}>{rating}</Text>
            </View>
            {year ? <Text style={styles.year}>{year}</Text> : null}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
});

// ── Fluid Continuous Dynamic Indicator Dots ──────────────────────────────────
interface IndicatorDotProps {
  index: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  onPress: (index: number) => void;
}

const IndicatorDot = memo(({ index, scrollX, cardWidth, onPress }: IndicatorDotProps) => {
  const dotAnimatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * cardWidth,
      index * cardWidth,
      (index + 1) * cardWidth,
    ];

    const widthVal = interpolate(
      scrollX.value,
      inputRange,
      [6, 22, 6],
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0.35, 1, 0.35],
      Extrapolation.CLAMP
    );

    return {
      width: widthVal,
      opacity,
      backgroundColor: widthVal > 10 ? '#E50914' : 'rgba(255, 255, 255, 0.65)',
    };
  });

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onPress(index)}
      hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
      style={styles.dotTouchable}
    >
      <Animated.View style={[styles.dot, dotAnimatedStyle]} />
    </TouchableOpacity>
  );
});

interface FluidIndicatorProps {
  count: number;
  scrollX: SharedValue<number>;
  cardWidth: number;
  onSelect: (index: number) => void;
}

const FluidIndicator = memo(({ count, scrollX, cardWidth, onSelect }: FluidIndicatorProps) => {
  return (
    <View style={styles.indicatorWrapper} pointerEvents="box-none">
      <View style={styles.indicatorPill}>
        {Array.from({ length: count }).map((_, i) => (
          <IndicatorDot
            key={i}
            index={i}
            scrollX={scrollX}
            cardWidth={cardWidth}
            onPress={onSelect}
          />
        ))}
      </View>
    </View>
  );
});

// ── Main Hero Section Component ──────────────────────────────────────────────
interface HeroSectionProps {
  items: TMDBResult[];
  toggleWatchlist: (item: TMDBResult) => void;
  savedIds: Set<number>;
}

const HeroSection = memo(({ items, toggleWatchlist, savedIds }: HeroSectionProps) => {
  const router = useRouter();
  const scrollX = useSharedValue(0);
  const flatListRef = useRef<Animated.FlatList<any>>(null);
  const autoplayTimer = useRef<NodeJS.Timeout | null>(null);
  const currentIndexRef = useRef(0);

  const slicedItems = items && items.length > 0 ? items.slice(0, 8) : [];
  const itemCount = slicedItems.length;

  const triggerHaptic = useCallback(() => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const updateCurrentIndex = (idx: number) => {
    currentIndexRef.current = idx;
  };

  // Continuous real-time scroll handler
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      const idx = Math.round(event.contentOffset.x / CARD_WIDTH);
      runOnJS(updateCurrentIndex)(idx);
    },
  });

  // Autoplay controls
  const stopAutoplay = useCallback(() => {
    if (autoplayTimer.current) {
      clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    if (itemCount <= 1) return;

    autoplayTimer.current = setInterval(() => {
      const nextIndex = (currentIndexRef.current + 1) % itemCount;
      currentIndexRef.current = nextIndex;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * CARD_WIDTH,
        animated: true,
      });
    }, AUTOPLAY_INTERVAL);
  }, [itemCount, stopAutoplay]);

  // Restart autoplay after user interaction
  const handleScrollBeginDrag = useCallback(() => {
    stopAutoplay();
  }, [stopAutoplay]);

  const handleScrollEndDrag = useCallback(() => {
    stopAutoplay();
    autoplayTimer.current = setTimeout(() => {
      startAutoplay();
    }, 1500) as any;
  }, [startAutoplay, stopAutoplay]);

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
    currentIndexRef.current = idx;
    stopAutoplay();
    autoplayTimer.current = setTimeout(() => {
      startAutoplay();
    }, 2000) as any;
  }, [startAutoplay, stopAutoplay]);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  const handleSlideSelect = useCallback((index: number) => {
    stopAutoplay();
    triggerHaptic();
    currentIndexRef.current = index;
    flatListRef.current?.scrollToOffset({
      offset: index * CARD_WIDTH,
      animated: true,
    });
    setTimeout(() => startAutoplay(), 3000);
  }, [startAutoplay, stopAutoplay, triggerHaptic]);

  const handleMoviePress = useCallback((item: TMDBResult) => {
    const mType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${item.id}?media_type=${mType}`);
  }, [router]);

  if (itemCount === 0) return null;

  return (
    <View style={[styles.root, { marginHorizontal: HORIZONTAL_MARGIN }]}>
      <Animated.FlatList
        ref={flatListRef}
        data={slicedItems}
        keyExtractor={(item) => `hero-${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={CARD_WIDTH}
        snapToAlignment="center"
        decelerationRate={Platform.OS === 'ios' ? 'fast' : 0.92}
        disableIntervalMomentum={true}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({ item, index }) => (
          <HeroSlide
            item={item}
            index={index}
            scrollX={scrollX}
            cardWidth={CARD_WIDTH}
            cardHeight={HERO_HEIGHT}
            isAdded={savedIds.has(item.id)}
            onToggleWatchlist={toggleWatchlist}
            onPress={handleMoviePress}
          />
        )}
      />

      {/* Fluid Real-time Dot Indicator */}
      <FluidIndicator
        count={itemCount}
        scrollX={scrollX}
        cardWidth={CARD_WIDTH}
        onSelect={handleSlideSelect}
      />
    </View>
  );
});

export default HeroSection;

const styles = StyleSheet.create({
  root: {
    marginBottom: 12,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0A0A0A',
  },
  slideContainer: {
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageMask: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#141414',
    justifyContent: 'center',
    alignItems: 'center',
  },
  parallaxImage: {
    backgroundColor: '#141414',
  },
  addBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 15,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 34,
    gap: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 25,
    fontFamily: 'GoogleSansFlex-Bold',
    letterSpacing: -0.4,
    lineHeight: 30,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontFamily: 'GoogleSansFlex-Bold',
  },
  year: {
    color: '#D0D0D0',
    fontSize: 13.5,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  indicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 10, 14, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 5,
  },
  dotTouchable: {
    paddingVertical: 3,
  },
  dot: {
    height: 4.5,
    borderRadius: 3,
  },
});
