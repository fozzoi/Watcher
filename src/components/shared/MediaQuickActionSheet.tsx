import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Share,
  DeviceEventEmitter,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getImageUrl } from '../../tmdb';
import { useAppTheme, shadows } from '../../theme';
import { hasSavedItem, addSavedItem, removeSavedItem } from '../../database';
import { toggleWatchlistGlobal, syncSavedStore } from '../../state/savedState';
import { getProgress, saveProgress, removeProgress, WatchProgress } from '../../utils/progress';

export const MediaQuickActionSheet = memo(function MediaQuickActionSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  const [visible, setVisible] = useState(false);
  const [item, setItem] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [progress, setProgress] = useState<WatchProgress | null>(null);

  const checkStatus = useCallback(async (mediaItem: any) => {
    if (!mediaItem || !mediaItem.id) return;
    const id = Number(mediaItem.id);
    const mediaType = mediaItem.media_type || (mediaItem.first_air_date ? 'tv' : 'movie');

    try {
      const saved = hasSavedItem(id, 'watchlist');
      const watched = hasSavedItem(id, 'history');
      setIsSaved(saved);
      setIsWatched(watched);

      const prog = await getProgress(id, mediaType);
      setProgress(prog);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('open_media_quick_action', (mediaItem) => {
      if (mediaItem && mediaItem.id) {
        setItem(mediaItem);
        void checkStatus(mediaItem);
        setVisible(true);
      }
    });

    return () => sub.remove();
  }, [checkStatus]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setItem(null);
      setProgress(null);
    }, 200);
  }, []);

  const handlePlay = useCallback(() => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleClose();

    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const season = progress?.lastSeason || 1;
    const episode = progress?.lastEpisode || 1;

    router.push({
      pathname: '/player',
      params: {
        id: String(item.id),
        media_type: mediaType,
        season: String(season),
        episode: String(episode),
        title: item.title || item.name || '',
        poster: item.poster_path || item.backdrop_path || '',
      },
    });
  }, [item, progress, router, handleClose]);

  const handleToggleWatchlist = useCallback(() => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleWatchlistGlobal(item);
    setIsSaved((prev) => !prev);
  }, [item]);

  const handleToggleWatched = useCallback(async () => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const id = Number(item.id);
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');

    if (isWatched) {
      removeSavedItem(id, 'history');
      await removeProgress(id);
      setIsWatched(false);
      setProgress(null);
    } else {
      addSavedItem(item, 'history');
      await saveProgress({
        tmdbId: id,
        mediaType,
        title: item.title || item.name || '',
        poster: item.poster_path || item.backdrop_path || '',
        lastSeason: 1,
        lastEpisode: 1,
        completed: true,
        position: 100,
        duration: 100,
        updatedAt: Date.now(),
      });
      setIsWatched(true);
    }
    syncSavedStore();
  }, [item, isWatched]);

  const handleOpenDetails = useCallback(() => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    handleClose();

    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    router.push({
      pathname: `/movie/${item.id}`,
      params: {
        media_type: mediaType,
        title: item.title || item.name || '',
        poster_path: item.poster_path || '',
        backdrop_path: item.backdrop_path || '',
      },
    });
  }, [item, router, handleClose]);

  const handleShare = useCallback(() => {
    if (!item) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
    const title = item.title || item.name || 'Title';
    void Share.share({
      title,
      message: `Watch "${title}" on Watcher! https://www.themoviedb.org/${mediaType}/${item.id}`,
    });
  }, [item]);

  if (!visible || !item) return null;

  const imagePath = item.poster_path || item.backdrop_path;
  const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
  const title = item.title || item.name || 'Untitled';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const mediaType = item.media_type === 'tv' || item.first_air_date ? 'Series' : 'Movie';
  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  const hasProgress = progress && progress.position > 15 && !progress.completed;
  const progressPct =
    hasProgress && progress.duration > 0
      ? Math.round((progress.position / progress.duration) * 100)
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.surfaceContainer,
              borderColor: colors.divider,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          {/* Drag Handle Indicator */}
          <View style={styles.handleRow}>
            <View style={[styles.handleBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)' }]} />
          </View>

          {/* Header Preview */}
          <View style={styles.previewHeader}>
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={[styles.previewPoster, { backgroundColor: colors.surfaceContainerHigh }]}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.previewPoster, styles.placeholderPoster, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Ionicons name="film-outline" size={24} color={colors.textSecondary} />
              </View>
            )}

            <View style={styles.previewMeta}>
              <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={2}>
                {title}
              </Text>
              <View style={styles.metaRow}>
                {year ? <Text style={[styles.metaSubtext, { color: colors.textSecondary }]}>{year}</Text> : null}
                {year ? <Text style={[styles.metaDot, { color: colors.textSecondary }]}>•</Text> : null}
                <Text style={[styles.metaSubtext, { color: colors.textSecondary }]}>{mediaType}</Text>
                {rating ? (
                  <>
                    <Text style={[styles.metaDot, { color: colors.textSecondary }]}>•</Text>
                    <Ionicons name="star" size={12} color="#FFD60A" />
                    <Text style={[styles.metaRating, { color: colors.text }]}>{rating}</Text>
                  </>
                ) : null}
              </View>

              {hasProgress ? (
                <View style={[styles.progressBadge, { backgroundColor: `${colors.primary}22` }]}>
                  <Ionicons name="time" size={11} color={colors.primary} />
                  <Text style={[styles.progressBadgeText, { color: colors.primary }]}>
                    {progress.lastSeason ? `S${progress.lastSeason}:E${progress.lastEpisode || 1} • ` : ''}
                    {progressPct ? `${progressPct}% watched` : 'In Progress'}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.separator, { backgroundColor: colors.divider }]} />

          {/* Action List */}
          <View style={styles.actionsList}>
            {/* 1. Play / Resume */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={[styles.actionRow, { backgroundColor: `${colors.primary}18` }]}
              onPress={handlePlay}
            >
              <View style={[styles.actionIconBox, { backgroundColor: colors.primary }]}>
                <Ionicons name="play" size={18} color="#FFF" style={{ marginLeft: 2 }} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.primary, fontWeight: '700' }]}>
                  {hasProgress ? 'Resume Playback' : 'Play Now'}
                </Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>
                  {hasProgress
                    ? `Continue from ${progressPct ? `${progressPct}%` : 'last point'}`
                    : 'Stream directly in player'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>

            {/* 2. Watchlist Toggle */}
            <TouchableOpacity activeOpacity={0.75} style={styles.actionRow} onPress={handleToggleWatchlist}>
              <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Ionicons
                  name={isSaved ? 'bookmark' : 'bookmark-outline'}
                  size={19}
                  color={isSaved ? colors.primary : colors.text}
                />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  {isSaved ? 'In Your Watchlist' : 'Add to Watchlist'}
                </Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>
                  {isSaved ? 'Tap to remove from saved' : 'Save to watch later'}
                </Text>
              </View>
              {isSaved ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
            </TouchableOpacity>

            {/* 3. Mark as Watched */}
            <TouchableOpacity activeOpacity={0.75} style={styles.actionRow} onPress={handleToggleWatched}>
              <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Ionicons
                  name={isWatched ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={20}
                  color={isWatched ? '#34C759' : colors.text}
                />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>
                  {isWatched ? 'Marked as Watched' : 'Mark as Watched'}
                </Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>
                  {isWatched ? 'Completed in your history' : 'Add to watched history'}
                </Text>
              </View>
              {isWatched ? <Ionicons name="checkmark" size={18} color="#34C759" /> : null}
            </TouchableOpacity>

            {/* 4. View Details */}
            <TouchableOpacity activeOpacity={0.75} style={styles.actionRow} onPress={handleOpenDetails}>
              <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Ionicons name="information-circle-outline" size={20} color={colors.text} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>View Details & Cast</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>
                  Overview, trailers, seasons, similar
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            {/* 5. Share */}
            <TouchableOpacity activeOpacity={0.75} style={styles.actionRow} onPress={handleShare}>
              <View style={[styles.actionIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <Ionicons name="share-social-outline" size={19} color={colors.text} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={[styles.actionTitle, { color: colors.text }]}>Share</Text>
                <Text style={[styles.actionSubtext, { color: colors.textSecondary }]}>
                  Send link to friends
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default MediaQuickActionSheet;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 20,
    ...shadows.xl,
  },
  handleRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 12,
  },
  previewPoster: {
    width: 54,
    height: 80,
    borderRadius: 10,
  },
  placeholderPoster: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewMeta: {
    flex: 1,
    gap: 4,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaSubtext: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 12,
  },
  metaRating: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 8,
  },
  actionsList: {
    gap: 8,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 14,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextCol: {
    flex: 1,
    gap: 2,
  },
  actionTitle: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  actionSubtext: {
    fontSize: 11.5,
  },
});
