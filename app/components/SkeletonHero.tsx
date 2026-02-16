import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { HERO_HEIGHT, HERO_CARD_WIDTH, HORIZONTAL_MARGIN } from './ExploreConstants';

const SkeletonHero = memo(() => (
  <View style={[styles.heroContainer, { marginHorizontal: HORIZONTAL_MARGIN }]}>
    <View style={styles.heroLoading}>
      <ActivityIndicator color="#E50914" size="large" />
    </View>
  </View>
));

export default SkeletonHero;

const styles = StyleSheet.create({
  heroContainer: { 
    width: HERO_CARD_WIDTH, height: HERO_HEIGHT, 
    backgroundColor: '#1A1A1A', borderRadius: 20, 
    overflow: 'hidden', alignSelf: 'center', marginBottom: 16 
  },
  heroLoading: { height: HERO_HEIGHT, justifyContent: 'center', alignItems: 'center' },
});