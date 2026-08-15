import React, { memo, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl, getFullDetails, TMDBResult } from '../../tmdb';
import QuickAddButton from '../shared/QuickAddButton';
import { ParallaxCarousel, ParallaxCarouselItem } from '../shared/ParallaxCarousel';
import { HERO_HEIGHT, HORIZONTAL_MARGIN } from './ExploreConstants';

const { width } = Dimensions.get('window');

// ── Typed item that satisfies the library + carries our TMDB data ─────────────
interface HeroCarouselItem extends ParallaxCarouselItem {
  tmdb: TMDBResult;
}

// ── Overlay: gradient, title, rating, add button ─────────────────────────────
const HeroOverlay = memo(({ item, router, toggleWatchlist, isAdded }: {
  item: HeroCarouselItem;
  router: any;
  toggleWatchlist: (item: TMDBResult) => void;
  isAdded: boolean;
}) => {
  const handlePress = useCallback(() => {
    const mType = item.tmdb.media_type || (item.tmdb.first_air_date ? 'tv' : 'movie');
    router.push(`/movie/${item.tmdb.id}?media_type=${mType}`);
  }, [item.tmdb, router]);

  const title = item.tmdb.title || item.tmdb.name || '';
  const year = (item.tmdb.release_date || item.tmdb.first_air_date || '').substring(0, 4);
  const rating = item.tmdb.vote_average?.toFixed(1) || 'N/A';

  return (
    <TouchableOpacity
      activeOpacity={0.95}
      onPress={handlePress}
      style={StyleSheet.absoluteFill}
    >
      {/* Add button */}
      <View style={styles.addBtn}>
        <QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item.tmdb)} />
      </View>

      {/* Bottom gradient + text */}
      <LinearGradient
        colors={['transparent', 'rgba(13,13,13,0.5)', 'rgba(13,13,13,0.97)']}
        locations={[0, 0.5, 1]}
        style={styles.gradient}
      >
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.metaRow}>
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={13} color="#FFD700" />
            <Text style={styles.ratingText}>{rating}</Text>
          </View>
          {year ? <Text style={styles.year}>{year}</Text> : null}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

// ── Dots ──────────────────────────────────────────────────────────────────────
const Dot = memo(({ isActive }: { isActive: boolean }) => {
  const rStyle = useAnimatedStyle(() => {
    return {
      width: withSpring(isActive ? 22 : 6, { damping: 15, stiffness: 150 }),
      backgroundColor: isActive ? '#E50914' : 'rgba(255,255,255,0.2)',
    };
  }, [isActive]);

  return <Animated.View style={[styles.dot, rStyle]} />;
});

const Dots = memo(({ count, active }: { count: number; active: number }) => (
  <View style={styles.dotsRow}>
    {Array.from({ length: count }).map((_, i) => (
      <Dot key={i} isActive={i === active} />
    ))}
  </View>
));

// ── Main ──────────────────────────────────────────────────────────────────────
const HeroSection = memo(({ items, toggleWatchlist, savedIds }: {
  items: TMDBResult[];
  toggleWatchlist: (item: TMDBResult) => void;
  savedIds: Set<number>;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const router = useRouter();

  if (!items || items.length === 0) return null;

  const CARD_WIDTH = width - HORIZONTAL_MARGIN * 2;
  const sliced = items.slice(0, 5);

  const carouselData: HeroCarouselItem[] = sliced.map(tmdb => ({
    image: { uri: getImageUrl(tmdb.poster_path, 'w780') },
    tmdb,
  }));

  return (
    <View style={[styles.wrapper, { marginHorizontal: HORIZONTAL_MARGIN }]}>
      <ParallaxCarousel
        data={carouselData}
        keyExtractor={(item, i) => `hero-${(item as HeroCarouselItem).tmdb?.id ?? i}`}
        itemWidth={CARD_WIDTH}
        itemHeight={HERO_HEIGHT}
        spacing={0}
        parallaxIntensity={0.15}
        pagingEnabled
        autoplay
        autoplayInterval={4000}
        loop
        onMomentumScrollEnd={(e: any) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / CARD_WIDTH);
          setActiveIndex(index);
        }}
        renderItem={({ item, index }) => (
          <HeroOverlay
            item={item as HeroCarouselItem}
            router={router}
            toggleWatchlist={toggleWatchlist}
            isAdded={savedIds.has((item as HeroCarouselItem).tmdb?.id)}
          />
        )}
      />
      <Dots count={sliced.length} active={activeIndex} />
    </View>
  );
});

export default HeroSection;

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  addBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 8,
    borderRadius: 19.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontFamily: 'GoogleSansFlex-Bold',
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  ratingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'GoogleSansFlex-Bold',
  },
  year: {
    color: '#CCC',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Regular',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E50914',
  },
});
