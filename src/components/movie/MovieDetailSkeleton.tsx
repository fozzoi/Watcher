import React from 'react';
import { View, StyleSheet, Dimensions, ScrollView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShimmerBlock } from '../shared/Shimmer';

const { width } = Dimensions.get('window');
const HEADER_HEIGHT = 460;
const TOP_BAR_PADDING = (StatusBar.currentHeight || 44) + 8;

export const MovieDetailSkeleton: React.FC = () => {
  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Top Floating Glass Buttons */}
      <View style={[styles.topBar, { paddingTop: TOP_BAR_PADDING }]}>
        <View style={styles.glassCircle} />
        <View style={styles.glassCircle} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Hero Backdrop Skeleton */}
        <View style={styles.heroBackdrop}>
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
          {/* Eyebrow */}
          <ShimmerBlock width="25%" height={11} style={{ marginBottom: 12 }} />

          {/* Title */}
          <ShimmerBlock width="80%" height={26} style={{ marginBottom: 8 }} />
          <ShimmerBlock width="45%" height={26} style={{ marginBottom: 16 }} />

          {/* Meta Info Row */}
          <View style={styles.metaRow}>
            <ShimmerBlock width={70} height={14} borderRadius={4} />
            <ShimmerBlock width={55} height={14} borderRadius={4} />
            <ShimmerBlock width={45} height={14} borderRadius={4} />
            <ShimmerBlock width={35} height={14} borderRadius={4} />
          </View>

          {/* Genre Chips Row */}
          <View style={styles.genreRow}>
            <ShimmerBlock width={75} height={28} borderRadius={14} />
            <ShimmerBlock width={85} height={28} borderRadius={14} />
            <ShimmerBlock width={65} height={28} borderRadius={14} />
          </View>

          {/* Big Play Button */}
          <ShimmerBlock width="100%" height={54} borderRadius={16} style={{ marginBottom: 12 }} />

          {/* 4 Action Buttons */}
          <View style={styles.actionRow}>
            <ShimmerBlock width="22%" height={54} borderRadius={14} />
            <ShimmerBlock width="22%" height={54} borderRadius={14} />
            <ShimmerBlock width="22%" height={54} borderRadius={14} />
            <ShimmerBlock width="22%" height={54} borderRadius={14} />
          </View>

          {/* Overview Section */}
          <View style={styles.section}>
            <ShimmerBlock width="30%" height={16} style={{ marginBottom: 10 }} />
            <ShimmerBlock width="100%" height={13} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="95%" height={13} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="85%" height={13} style={{ marginBottom: 6 }} />
            <ShimmerBlock width="60%" height={13} style={{ marginBottom: 24 }} />
          </View>

          {/* Cast Section */}
          <View style={styles.section}>
            <ShimmerBlock width="35%" height={16} style={{ marginBottom: 14 }} />
            <View style={styles.horizontalRow}>
              {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.castCard}>
                  <ShimmerBlock width={95} height={135} borderRadius={12} />
                  <ShimmerBlock width={80} height={11} style={{ marginTop: 8 }} />
                  <ShimmerBlock width={55} height={9} style={{ marginTop: 4 }} />
                </View>
              ))}
            </View>
          </View>

          {/* Directors / Crew Section */}
          <View style={styles.section}>
            <ShimmerBlock width="25%" height={16} style={{ marginBottom: 14 }} />
            <View style={styles.horizontalRow}>
              {[1, 2].map((i) => (
                <View key={i} style={styles.directorCard}>
                  <ShimmerBlock width={40} height={40} borderRadius={20} />
                  <View style={{ flex: 1, gap: 6, marginLeft: 10 }}>
                    <ShimmerBlock width="80%" height={12} />
                    <ShimmerBlock width="50%" height={10} />
                  </View>
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
  heroBackdrop: {
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
    marginBottom: 20,
  },
  horizontalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  castCard: {
    width: 95,
  },
  directorCard: {
    width: 170,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#121215',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
});
