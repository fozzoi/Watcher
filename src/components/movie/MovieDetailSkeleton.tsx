import React from 'react';
import { View, StyleSheet, ScrollView, StatusBar, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShimmerBlock } from '../shared/Shimmer';
import { useAppTheme } from '../../theme';

const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

export const MovieDetailSkeleton: React.FC = () => {
  const { colors, isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const HEADER_HEIGHT = isLandscape ? height * 0.55 : height * 0.50;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Static Hero Backdrop Skeleton — Matches app/movie/[id].tsx identically */}
      <View style={[styles.heroContainer, { height: HEADER_HEIGHT }]} pointerEvents="none">
        <ShimmerBlock width="100%" height={HEADER_HEIGHT} borderRadius={0} style={styles.heroShimmer} />
        <LinearGradient
          colors={['rgba(10,10,11,0.1)', 'transparent', '#0A0A0B']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Top Floating Glass Buttons */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <View style={styles.glassCircle} />
      </View>

      {/* Single Scroll Container with identical spacer */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Exact same spacer height as app/movie/[id].tsx */}
        <View style={{ height: HEADER_HEIGHT + 30 }} />

        {/* Card Body */}
        <View style={[styles.cardTop, { backgroundColor: colors.background }]}>
          {/* Eyebrow */}
          <ShimmerBlock width={110} height={12} style={{ marginBottom: 8 }} />

          {/* Title */}
          <ShimmerBlock width="75%" height={28} style={{ marginBottom: 12 }} />

          {/* Meta Info Row */}
          <View style={styles.metaRow}>
            <ShimmerBlock width={60} height={14} borderRadius={4} />
            <ShimmerBlock width={45} height={14} borderRadius={4} />
            <ShimmerBlock width={35} height={14} borderRadius={4} />
          </View>

          {/* Genre Chips Row */}
          <View style={styles.genreRow}>
            <ShimmerBlock width={80} height={32} borderRadius={20} />
            <ShimmerBlock width={95} height={32} borderRadius={20} />
            <ShimmerBlock width={75} height={32} borderRadius={20} />
          </View>

          {/* Primary Play CTA */}
          <ShimmerBlock width="100%" height={50} borderRadius={14} style={{ marginBottom: 10 }} />

          {/* Primary Download CTA */}
          <ShimmerBlock width="100%" height={50} borderRadius={14} style={{ marginBottom: 16 }} />

          {/* Action Dock: 3 matching buttons (Watchlist, Watched, Telegram) */}
          <View style={styles.actionRow}>
            <ShimmerBlock width="31%" height={46} borderRadius={14} />
            <ShimmerBlock width="31%" height={46} borderRadius={14} />
            <ShimmerBlock width="31%" height={46} borderRadius={14} />
          </View>

          {/* Overview Section */}
          <View style={styles.section}>
            <ShimmerBlock width="100%" height={14} style={{ marginBottom: 8 }} />
            <ShimmerBlock width="95%" height={14} style={{ marginBottom: 8 }} />
            <ShimmerBlock width="80%" height={14} style={{ marginBottom: 24 }} />
          </View>

          {/* Cast Section */}
          <View style={styles.section}>
            <ShimmerBlock width={80} height={18} style={{ marginBottom: 14 }} />
            <View style={styles.horizontalRow}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.castCard}>
                  <ShimmerBlock width={95} height={130} borderRadius={12} />
                  <ShimmerBlock width={80} height={11} style={{ marginTop: 8 }} />
                  <ShimmerBlock width={55} height={9} style={{ marginTop: 4 }} />
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  heroContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    backgroundColor: '#0A0A0B',
    zIndex: 0,
  },
  heroShimmer: {
    backgroundColor: '#111114',
  },
  cardTop: {
    backgroundColor: '#0A0A0B',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 24,
    minHeight: 800,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  castCard: {
    width: 95,
  },
});
