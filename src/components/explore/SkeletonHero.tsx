import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HERO_HEIGHT, HERO_CARD_WIDTH, HORIZONTAL_MARGIN } from './ExploreConstants';
import { ShimmerBlock } from '../shared/Shimmer';

const SkeletonHero = memo(() => (
  <View style={[styles.heroContainer, { marginHorizontal: HORIZONTAL_MARGIN }]}>
    <ShimmerBlock width={HERO_CARD_WIDTH} height={HERO_HEIGHT} borderRadius={22} />
    <LinearGradient
      colors={['transparent', 'rgba(10,10,10,0.5)', 'rgba(10,10,10,0.95)']}
      locations={[0, 0.45, 1]}
      style={styles.gradient}
    >
      <ShimmerBlock width="70%" height={24} style={{ marginBottom: 10 }} />
      <View style={styles.metaRow}>
        <ShimmerBlock width={50} height={18} borderRadius={10} />
        <ShimmerBlock width={40} height={14} />
      </View>
    </LinearGradient>
  </View>
));

export default SkeletonHero;

const styles = StyleSheet.create({
  heroContainer: { 
    width: HERO_CARD_WIDTH, 
    height: HERO_HEIGHT, 
    backgroundColor: '#111114', 
    borderRadius: 22, 
    overflow: 'hidden', 
    alignSelf: 'center', 
    marginBottom: 12,
    position: 'relative',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});