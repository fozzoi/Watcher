import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getImageUrl } from '../../tmdb';
import type { WatchProgress } from '../../utils/progress';
import { removeProgress } from '../../utils/progress';
import { useAppTheme, shadows } from '../../theme';
import { HORIZONTAL_MARGIN } from './ExploreConstants';

const CARD_WIDTH = 224;
const THUMB_HEIGHT = 126;

interface ContinueWatchingShelfProps {
  items: WatchProgress[];
  onRemoveItem?: (tmdbId: number) => void;
}

const ContinueWatchingCard = memo(
  ({
    item,
    onRemove,
  }: {
    item: WatchProgress;
    onRemove: (tmdbId: number) => void;
  }) => {
    const router = useRouter();
    const { colors, isDark } = useAppTheme();

    const isTV = item.mediaType === 'tv';
    const progress =
      item.duration > 0
        ? Math.min(1, Math.max(0, item.position / item.duration))
        : 0;

    const remainingSec = Math.max(0, (item.duration || 0) - (item.position || 0));
    const remainingMin = Math.round(remainingSec / 60);
    const progressText =
      remainingMin > 0
        ? `${remainingMin}m left`
        : `${Math.round(progress * 100)}%`;

    const imageUrl = item.poster
      ? getImageUrl(item.poster, 'w500')
      : null;

    const handlePlay = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push({
        pathname: '/player',
        params: {
          id: String(item.tmdbId),
          media_type: item.mediaType,
          season: String(item.lastSeason || 1),
          episode: String(item.lastEpisode || 1),
          title: item.title || '',
          poster: item.poster || '',
        },
      });
    }, [item, router]);

    const handleOpenDetails = useCallback(() => {
      router.push({
        pathname: `/movie/${item.tmdbId}`,
        params: {
          media_type: item.mediaType,
        },
      });
    }, [item, router]);

    const handleRemove = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void removeProgress(item.tmdbId);
      onRemove(item.tmdbId);
    }, [item.tmdbId, onRemove]);

    return (
      <View style={[styles.card, { backgroundColor: colors.surfaceContainer, borderColor: colors.divider }]}>
        {/* ── Thumbnail & Direct Resume Button ── */}
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handlePlay}
          style={styles.thumbWrapper}
          accessibilityRole="button"
          accessibilityLabel={`Resume ${item.title || 'video'}`}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={imageUrl}
            />
          ) : (
            <View style={[styles.placeholderThumb, { backgroundColor: colors.surfaceContainerHigh }]}>
              <Ionicons name="film-outline" size={28} color={colors.textSecondary} />
            </View>
          )}

          {/* Scrim overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.85)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Type / Episode Badge */}
          <View style={styles.badgePill}>
            <Text style={styles.badgeText}>
              {isTV ? `S${item.lastSeason || 1}:E${item.lastEpisode || 1}` : 'MOVIE'}
            </Text>
          </View>

          {/* Quick Remove "X" */}
          <Pressable
            onPress={handleRemove}
            hitSlop={8}
            style={styles.removeBtn}
            accessibilityRole="button"
            accessibilityLabel="Remove from continue watching"
          >
            <Ionicons name="close" size={14} color="#FFF" />
          </Pressable>

          {/* Central Frosted Play Button */}
          <View style={styles.playCenter}>
            <View style={[styles.playCircle, { backgroundColor: colors.primary }]}>
              <Ionicons name="play" size={16} color="#FFF" style={{ marginLeft: 2 }} />
            </View>
          </View>

          {/* Progress Bar Track */}
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.max(4, Math.round(progress * 100))}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </TouchableOpacity>

        {/* ── Metadata Info ── */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenDetails}
          style={styles.metaArea}
          accessibilityRole="button"
          accessibilityLabel={`View details for ${item.title || 'video'}`}
        >
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {item.title || 'Untitled'}
          </Text>
          <View style={styles.subRow}>
            <View style={[styles.timePill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
              <Ionicons name="time-outline" size={11} color={colors.textSecondary} />
              <Text style={[styles.timeText, { color: colors.textSecondary }]}>{progressText}</Text>
            </View>
            <Text style={[styles.resumeText, { color: colors.primary }]}>Resume</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
);

export const ContinueWatchingShelf = memo(function ContinueWatchingShelf({
  items,
  onRemoveItem,
}: ContinueWatchingShelfProps) {
  const { colors } = useAppTheme();

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <View style={[styles.accentBar, { backgroundColor: colors.primary }]} />
          <Text style={[styles.shelfTitle, { color: colors.text }]}>Continue Watching</Text>
        </View>
        <Text style={[styles.countBadge, { color: colors.textSecondary }]}>
          {items.length} {items.length === 1 ? 'title' : 'titles'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 14}
        snapToAlignment="start"
      >
        {items.slice(0, 10).map((item) => (
          <ContinueWatchingCard
            key={`cw-${item.tmdbId}-${item.lastSeason}-${item.lastEpisode}`}
            item={item}
            onRemove={(id) => onRemoveItem?.(id)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

export default ContinueWatchingShelf;

const styles = StyleSheet.create({
  container: {
    marginTop: 6,
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 12,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  accentBar: {
    width: 3.5,
    height: 18,
    borderRadius: 2,
  },
  shelfTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  scrollContent: {
    paddingLeft: HORIZONTAL_MARGIN,
    paddingRight: HORIZONTAL_MARGIN - 14,
  },
  card: {
    width: CARD_WIDTH,
    marginRight: 14,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    ...shadows.md,
  },
  thumbWrapper: {
    width: '100%',
    height: THUMB_HEIGHT,
    position: 'relative',
    backgroundColor: '#121214',
    overflow: 'hidden',
  },
  placeholderThumb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playCenter: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  progressBarBg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressBarFill: {
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  metaArea: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 11,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  resumeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
