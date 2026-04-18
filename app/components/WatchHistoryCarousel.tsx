import React, { useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView, BlurTargetView } from 'expo-blur';
import { getImageUrl } from '../../src/tmdb';
import { WatchProgress } from '../../src/utils/progress';
import { HORIZONTAL_MARGIN } from './ExploreConstants';

interface WatchHistoryCarouselProps {
  history: WatchProgress[];
  onRemove: (tmdbId: number) => void;
  navigation: any;
}

// ─── Each card is its own component so it owns its BlurTargetView ref ────────
interface CardProps {
  item: WatchProgress;
  onRemove: (id: number) => void;
  navigation: any;
}

const HistoryCard: React.FC<CardProps> = ({ item, onRemove, navigation }) => {
  // SDK 55: BlurView needs a ref to BlurTargetView to know what to blur
  const posterRef = useRef(null);

  const date = new Date(item.updatedAt);
  const isToday = new Date().toDateString() === date.toDateString();
  const isYesterday =
    new Date(Date.now() - 86400000).toDateString() === date.toDateString();
  const dateString = isToday
    ? 'Today'
    : isYesterday
    ? 'Yesterday'
    : `${date.getDate()}/${date.getMonth() + 1}`;

  const progress = item.progress ?? 0; // 0–1 float
  const isTV = item.mediaType === 'tv';

  return (
    <View style={styles.card}>

      {/* ── TOP: Poster — tap to resume playback ── */}
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() =>
          navigation.navigate('Player', {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            season: item.lastSeason,
            episode: item.lastEpisode,
            title: item.title,
            poster: item.poster,
            startIndex: 0,
          })
        }
      >
        <View style={styles.posterContainer}>
          {/*
            SDK 55 Android blur — new API:
            BlurTargetView wraps the content to be blurred (the image).
            BlurView sits on top and references it via blurTarget={posterRef}.
            overflow: 'hidden' on posterContainer clips everything to the card radius.
          */}
          <BlurTargetView ref={posterRef} style={StyleSheet.absoluteFillObject}>
            <Image
              source={{ uri: getImageUrl(item.poster, 'w342') }}
              style={styles.poster}
            />
          </BlurTargetView>

          {/* Gradient scrim — bottom darkens for legibility */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0.35 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
          />

          {/* TV / FILM badge — top left */}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{isTV ? 'TV' : 'FILM'}</Text>
          </View>

          {/*
            Frosted play button — SDK 55 correct usage:
              • blurTarget={posterRef}  → references the BlurTargetView above
              • blurMethod="dimezisBlurView" → enables Android native blur
              • overflow: 'hidden' on the style → clips blur to the circle shape
            On Android < SDK 31 it gracefully falls back to semi-transparent.
          */}
          <BlurView
            blurTarget={posterRef}
            intensity={30}
            tint="dark"
            blurMethod="dimezisBlurView"
            style={styles.playBtn}
          >
            <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
          </BlurView>

          {/* Red progress bar pinned to poster bottom */}
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
            />
          </View>
        </View>
      </TouchableOpacity>

      {/* ── BOTTOM: Info — tap to open Detail page ── */}
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.body}
        onPress={() =>
          navigation.navigate('Detail', {
            movie: { id: item.tmdbId, media_type: item.mediaType },
          })
        }
      >
        <Text style={styles.title} numberOfLines={1}>
          {item.title || 'Unknown'}
        </Text>

        <View style={styles.metaRow}>
          <View style={styles.epPill}>
            <Text style={styles.epText}>
              {isTV ? `S${item.lastSeason}  E${item.lastEpisode}` : 'Movie'}
            </Text>
          </View>
          <Text style={styles.dateText}>{dateString}</Text>
        </View>

        <Text style={styles.progressLabel}>
          {Math.round(progress * 100)}% watched
        </Text>
      </TouchableOpacity>

      {/* ── REMOVE: X button — top right, sits over the poster ── */}
      <TouchableOpacity
        style={styles.removeBtn}
        onPress={e => {
          e.stopPropagation();
          onRemove(item.tmdbId);
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {/*
          Reuses the same posterRef — the remove button also overlays the poster area.
          overflow: 'hidden' clips the blur to the circle shape.
        */}
        <BlurView
          blurTarget={posterRef}
          intensity={40}
          tint="dark"
          blurMethod="dimezisBlurView"
          style={styles.removeBlur}
        >
          <Ionicons name="close" size={11} color="#fff" />
        </BlurView>
      </TouchableOpacity>
    </View>
  );
};

// ─── Main carousel ───────────────────────────────────────────────────────────
const WatchHistoryCarousel: React.FC<WatchHistoryCarouselProps> = ({
  history,
  onRemove,
  navigation,
}) => {
  if (!history || history.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.accentBar} />
          <Text style={styles.sectionTitle}>Continue Watching</Text>
        </View>
        <Text style={styles.countLabel}>{history.length} titles</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={200 + 14}  // card width + gap
        snapToAlignment="start"
      >
        {history.map((item, index) => (
          <Animated.View
            key={item.tmdbId}
            entering={FadeInDown.delay(index * 60).springify()}
            layout={Layout.springify()}
          >
            <HistoryCard item={item} onRemove={onRemove} navigation={navigation} />
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
};

export default WatchHistoryCarousel;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  section: {
    marginBottom: 36,
    marginTop: 8,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#E50914',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'GoogleSansFlex-Bold',
    letterSpacing: 0.2,
  },
  countLabel: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'GoogleSansFlex-Medium',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  /* Scroll */
  scrollContent: {
    paddingLeft: HORIZONTAL_MARGIN,
    paddingRight: HORIZONTAL_MARGIN - 14,
  },

  /* Card shell */
  card: {
    width: 200,
    marginRight: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',  // clips BlurTargetView + image to card radius
    borderWidth: 0.5,
    borderColor: '#2e2e2e',
    position: 'relative',
  },

  /* Poster area */
  posterContainer: {
    width: '100%',
    height: 130,
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  poster: {
    width: '100%',
    height: '100%',
  },

  /* Frosted play button */
  playBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 40,
    height: 40,
    borderRadius: 20,
    marginTop: -20,
    marginLeft: -20,
    overflow: 'hidden',  // required — clips blur effect to circle
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  /* TV / FILM badge */
  typeBadge: {
    position: 'absolute',
    top: 9,
    left: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  typeBadgeText: {
    color: '#ccc',
    fontSize: 9,
    fontFamily: 'GoogleSansFlex-Bold',
    letterSpacing: 1,
  },

  /* Progress bar */
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E50914',
  },

  /* Card body */
  body: {
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 13,
    gap: 6,
  },
  title: {
    color: '#f0f0f0',
    fontSize: 14,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  epPill: {
    backgroundColor: '#2a2a2a',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 0.5,
    borderColor: '#3a3a3a',
  },
  epText: {
    color: '#E50914',
    fontSize: 10,
    fontFamily: 'GoogleSansFlex-Bold',
    letterSpacing: 0.5,
  },
  dateText: {
    color: '#555',
    fontSize: 10,
    fontFamily: 'GoogleSansFlex-Medium',
  },
  progressLabel: {
    color: '#444',
    fontSize: 10,
    fontFamily: 'GoogleSansFlex-Medium',
  },

  /* Remove button */
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
  },
  removeBlur: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',  // required — clips blur effect to circle
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
  },
});