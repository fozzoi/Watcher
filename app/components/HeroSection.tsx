import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl, getFullDetails, TMDBResult } from '../../src/tmdb';
import QuickAddButton from './QuickAddButton';
import { HERO_CARD_WIDTH, HERO_HEIGHT, HORIZONTAL_MARGIN } from './ExploreConstants';

const HeroItem = memo(({ item, navigation, toggleWatchlist, isAdded }: any) => {
  const handlePress = useCallback(async () => {
    try {
      const fullDetails = await getFullDetails(item);
      navigation.navigate('Detail', { movie: fullDetails });
    } catch (error) { console.error(error); }
  }, [item, navigation]);

  return (
    <TouchableOpacity activeOpacity={0.9} style={styles.heroItemContainer} onPress={handlePress}>
      <Image source={{ uri: getImageUrl(item.poster_path, 'w500') }} style={styles.heroImage} resizeMode="cover" />
      <View style={styles.heroAddButtonContainer}>
        <QuickAddButton isAdded={isAdded} onPress={() => toggleWatchlist(item)} />
      </View>
      <LinearGradient colors={['transparent', 'rgba(20, 20, 20, 0.5)', 'rgba(20, 20, 20, 1)']} style={styles.heroGradient}>
        <View style={styles.heroContentWrapper}>
          <Text style={styles.heroTitle} numberOfLines={1}>{item.title || item.name}</Text>
          <View style={styles.heroMetaRow}>
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={14} color="#FFD700" />
              <Text style={styles.ratingText}>{item.vote_average?.toFixed(1) || 'N/A'}</Text>
            </View>
            <Text style={styles.heroYear}>{(item.release_date || item.first_air_date || '').substring(0, 4)}</Text>
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

const HeroSection = memo(({ items, navigation, toggleWatchlist, savedIds }: any) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlashList<TMDBResult>>(null);

  useEffect(() => {
    if (!items || items.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex(prevIndex => {
        const nextIndex = (prevIndex + 1) % Math.min(5, items.length);
        listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        return nextIndex;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [items]);

  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={[styles.heroContainer, { marginHorizontal: HORIZONTAL_MARGIN }]}>
        <FlashList
          ref={listRef}
          data={items.slice(0, 5)}
          renderItem={({ item }) => (
            <HeroItem 
                item={item} 
                navigation={navigation} 
                isAdded={savedIds.has(item.id)} 
                toggleWatchlist={toggleWatchlist} 
            />
          )}
          keyExtractor={item => `hero-${item.id}`}
          horizontal pagingEnabled estimatedItemSize={HERO_CARD_WIDTH} showsHorizontalScrollIndicator={false}
          onScroll={(e) => { const index = Math.round(e.nativeEvent.contentOffset.x / HERO_CARD_WIDTH); if (index !== activeIndex) setActiveIndex(index); }}
          scrollEventThrottle={16}
        />
      </View>
      <View style={styles.paginationContainer}>
        {items.slice(0, 5).map((_, index: number) => (
          <View key={index} style={[styles.paginationDot, activeIndex === index && styles.paginationDotActive]} />
        ))}
      </View>
    </View>
  );
});

export default HeroSection;

const styles = StyleSheet.create({
  heroContainer: { width: HERO_CARD_WIDTH, height: HERO_HEIGHT, backgroundColor: '#1A1A1A', borderRadius: 20, overflow: 'hidden', alignSelf: 'center', marginBottom: 16 },
  heroItemContainer: { width: HERO_CARD_WIDTH, height: HERO_HEIGHT },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%', justifyContent: 'flex-end', padding: 20 },
  heroAddButtonContainer: { position: 'absolute', top: 16, right: 16, zIndex: 20 },
  heroContentWrapper: { gap: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 28, fontFamily: 'GoogleSansFlex-Bold' },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  ratingText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'GoogleSansFlex-Bold' },
  heroYear: { color: '#DDD', fontSize: 15, fontFamily: 'GoogleSansFlex-Regular' },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 },
  paginationDotActive: { backgroundColor: '#E50914', width: 24, height: 8, borderRadius: 4 },
});