import React from 'react';
import { View, StyleSheet, Dimensions, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShimmerBlock } from '../shared/Shimmer';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 440;
const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

export const CastDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Top Floating Glass Buttons */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <View style={styles.glassCircle} />
        <View style={styles.glassCircle} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Profile Backdrop Skeleton */}
        <View style={styles.headerBackdrop}>
          <ShimmerBlock width="100%" height={HEADER_HEIGHT} borderRadius={0} style={styles.heroShimmer} />
          <LinearGradient
            colors={['rgba(10,10,11,0.2)', 'transparent', 'rgba(10,10,11,0.6)', '#0A0A0B']}
            locations={[0, 0.35, 0.75, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        {/* Card Body */}
        <View style={styles.cardTop}>
          {/* Department Eyebrow */}
          <ShimmerBlock width="25%" height={11} style={{ marginBottom: 12 }} />

          {/* Name */}
          <ShimmerBlock width="70%" height={28} style={{ marginBottom: 14 }} />

          {/* Meta Info Row */}
          <View style={styles.metaRow}>
            <ShimmerBlock width={80} height={14} borderRadius={4} />
            <ShimmerBlock width={60} height={14} borderRadius={4} />
            <ShimmerBlock width={50} height={14} borderRadius={4} />
          </View>

          {/* Bio Section */}
          <View style={styles.section}>
            <ShimmerBlock width="30%" height={16} style={{ marginBottom: 12 }} />
            <ShimmerBlock width="100%" height={13} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="95%" height={13} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="80%" height={13} style={{ marginBottom: 24 }} />
          </View>

          {/* Known For Section */}
          <View style={styles.section}>
            <ShimmerBlock width="35%" height={16} style={{ marginBottom: 14 }} />
            <View style={styles.horizontalRow}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.movieCard}>
                  <ShimmerBlock width={110} height={165} borderRadius={12} />
                  <ShimmerBlock width={90} height={12} style={{ marginTop: 8 }} />
                  <ShimmerBlock width={60} height={10} style={{ marginTop: 4 }} />
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0B',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  glassCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerBackdrop: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  heroShimmer: {
    backgroundColor: '#111114',
  },
  cardTop: {
    marginTop: -40,
    backgroundColor: '#0A0A0B',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  movieCard: {
    width: 110,
  },
});
