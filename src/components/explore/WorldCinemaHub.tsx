// src/components/explore/WorldCinemaHub.tsx
import React, { memo, useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LegendList } from '@legendapp/list/react-native';
import { Ionicons } from '@expo/vector-icons';
import { getImageUrl } from '../../tmdb';
import QuickAddButton from '../shared/QuickAddButton';
import { HORIZONTAL_MARGIN } from './ExploreConstants';
import { LANGUAGE_OPTIONS } from '../../userPreferences';
import { useAppTheme, shadows, getActiveGlowShadow } from '../../theme';
import { warmPaletteForMedia } from '../../utils/colorExtractor';

const CARD_WIDTH = 135;
const CARD_HEIGHT = CARD_WIDTH * 1.5;
const GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + GAP;

interface WorldCinemaHubProps {
  langData: Record<string, { movies?: any[]; tv?: any[] }>;
  savedIds?: Set<number>;
  toggleWatchlist: (item: any) => void;
}

const WorldCinemaHub = memo(({ langData, savedIds, toggleWatchlist }: WorldCinemaHubProps) => {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();

  const availableLangs = useMemo(() => {
    if (!langData) return [];
    const keys = Object.keys(langData).filter((k) => {
      const d = langData[k];
      return (d.movies && d.movies.length > 0) || (d.tv && d.tv.length > 0);
    });
    return keys.map((code) => {
      const match = LANGUAGE_OPTIONS.find((opt) => opt.code === code);
      return { code, label: match ? match.label : code.toUpperCase() };
    });
  }, [langData]);

  const [activeCode, setActiveCode] = useState<string>('all');

  // Interleave movies & series so both appear side-by-side
  const activeItems = useMemo(() => {
    if (!langData) return [];

    const interleave = (movies: any[], series: any[]) => {
      const result: any[] = [];
      const maxLen = Math.max(movies.length, series.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < movies.length) result.push({ ...movies[i], _mediaType: 'movie' });
        if (i < series.length) result.push({ ...series[i], _mediaType: 'tv' });
      }
      return result;
    };

    if (activeCode === 'all') {
      const combined: any[] = [];
      Object.entries(langData).forEach(([code, data]) => {
        const m = (data.movies || []).slice(0, 2).map((item) => ({ ...item, _langCode: code }));
        const t = (data.tv || []).slice(0, 2).map((item) => ({ ...item, _langCode: code }));
        combined.push(...interleave(m, t));
      });
      return combined.slice(0, 16);
    }

    const current = langData[activeCode];
    if (!current) return [];

    const m = (current.movies || []).map((item) => ({ ...item, _langCode: activeCode }));
    const t = (current.tv || []).map((item) => ({ ...item, _langCode: activeCode }));
    return interleave(m, t).slice(0, 16);
  }, [langData, activeCode]);

  const handleViewAll = useCallback(() => {
    router.push(`/viewall?title=${encodeURIComponent('World Cinema')}&type=lang&lang=${activeCode}`);
  }, [router, activeCode]);

  const handlePress = useCallback(
    (item: any) => {
      warmPaletteForMedia(item);
      const mediaType = item._mediaType || item.media_type || (item.first_air_date ? 'tv' : 'movie');
      router.push(`/movie/${item.id}?media_type=${mediaType}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const imagePath = item.poster_path || item.backdrop_path;
      const imageUrl = imagePath ? getImageUrl(imagePath, 'w342') : null;
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const isTV = item._mediaType === 'tv' || Boolean(item.first_air_date);

      return (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handlePress(item)}
          style={styles.cardContainer}
        >
          <View style={[styles.cardShadow, { backgroundColor: colors.surfaceContainer }]}>
            <View style={[styles.posterBox, { backgroundColor: colors.surfaceContainer }]}>
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={imageUrl}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: colors.surfaceContainer }]}>
                  <Ionicons name="film-outline" size={24} color={colors.textSecondary} />
                </View>
              )}

              {/* Quick Watchlist Heart: bare, top-right, granular reactivity without parent re-render */}
              <View style={styles.heartOverlay}>
                <QuickAddButton
                  item={item}
                  itemId={item.id}
                  plain
                  onPress={() => toggleWatchlist(item)}
                />
              </View>

              {/* Rating — anchored to the poster bottom */}
              {item.vote_average ? (
                <View
                  style={[
                    styles.ratingChip,
                    {
                      backgroundColor: isDark ? 'rgba(10, 10, 12, 0.72)' : 'rgba(255, 255, 255, 0.92)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.07)',
                    },
                  ]}
                >
                  <Ionicons name="star" size={11} color={isDark ? '#FFD60A' : '#E6A700'} />
                  <Text style={[styles.ratingText, { color: colors.text }]}>
                    {item.vote_average.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title || item.name}
          </Text>
          <Text style={[styles.cardSubtext, { color: colors.textSecondary }]} numberOfLines={1}>
            {year ? `${year} • ` : ''}{isTV ? 'Series' : 'Movie'}
          </Text>
        </TouchableOpacity>
      );
    },
    [handlePress, toggleWatchlist, colors]
  );

  if (!availableLangs.length) return null;

  return (
    <View style={styles.sectionContainer}>
      {/* Tappable Header to View All */}
      <TouchableOpacity activeOpacity={0.7} onPress={handleViewAll} style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>World Cinema</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </View>
        <Text style={[styles.langCounter, { color: colors.textSecondary }]}>{availableLangs.length} Languages</Text>
      </TouchableOpacity>

      {/* Language Filter Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveCode('all')}
          style={[
            styles.tabChip,
            activeCode === 'all'
              ? [styles.tabChipActive, { backgroundColor: colors.primary, borderColor: colors.primary }, getActiveGlowShadow(colors.primary)]
              : [shadows.sm, { backgroundColor: colors.surfaceContainer, borderColor: isDark ? colors.outlineVariant : 'rgba(0, 0, 0, 0.08)' }],
          ]}
        >
          <Text style={[styles.tabText, { color: activeCode === 'all' ? colors.onPrimary : colors.textSecondary }, activeCode === 'all' && styles.tabTextActive]}>
            {activeCode === 'all' ? '• All' : 'All'}
          </Text>
        </TouchableOpacity>
        {availableLangs.map((lang) => {
          const isSelected = activeCode === lang.code;
          return (
            <TouchableOpacity
              key={`lang-tab-${lang.code}`}
              activeOpacity={0.8}
              onPress={() => setActiveCode(lang.code)}
              style={[
                styles.tabChip,
                isSelected
                  ? [styles.tabChipActive, { backgroundColor: colors.primary, borderColor: colors.primary }, getActiveGlowShadow(colors.primary)]
                  : [shadows.sm, { backgroundColor: colors.surfaceContainer, borderColor: isDark ? colors.outlineVariant : 'rgba(0, 0, 0, 0.08)' }],
              ]}
            >
              <Text style={[styles.tabText, { color: isSelected ? colors.onPrimary : colors.textSecondary }, isSelected && styles.tabTextActive]}>
                {lang.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Interleaved Movies + TV Rail */}
      <LegendList
        horizontal
        data={activeItems}
        keyExtractor={(item) => `world-${item._mediaType}-${item.id}-${activeCode}`}
        renderItem={renderItem}
        recycleItems={false}
        getFixedItemSize={() => SNAP_INTERVAL}
        estimatedItemSize={SNAP_INTERVAL}
        drawDistance={150}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
      />
    </View>
  );
},
(prev, next) =>
  prev.langData === next.langData
);

export default WorldCinemaHub;

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_MARGIN,
    marginBottom: 8,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sectionTitle: {
    color: '#FAFAFA',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  langCounter: {
    color: '#9B9BA3',
    fontSize: 12,
    fontWeight: '600',
  },
  tabsContainer: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 4,
    gap: 6,
    marginBottom: 8,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  tabChipActive: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 6,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: GAP,
    marginBottom: 8,
  },
  cardShadow: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 14,
    ...shadows.md,
    marginBottom: 8,
  },
  posterBox: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 14,
    backgroundColor: '#18181C',
    overflow: 'hidden',
    position: 'relative',
  },
  placeholder: {
    backgroundColor: '#161618',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  ratingChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
    filter: [
      { dropShadow: { offsetX: 0, offsetY: 1, standardDeviation: 3, color: 'rgba(0, 0, 0, 0.35)' } },
    ],
  },
  ratingText: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardTitle: {
    color: '#FAFAFA',
    fontSize: 13,
    fontWeight: '700',
  },
  cardSubtext: {
    color: '#9B9BA3',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});