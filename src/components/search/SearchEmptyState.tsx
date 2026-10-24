// src/components/search/SearchEmptyState.tsx
import React, { memo, useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  StatusBar,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../../theme';
import { getSavedItems, getExploreContentCacheSync } from '../../database';
import { getForYouShelvesSync } from '../../services/tasteProfile';
import { getGenreIcon, HORIZONTAL_MARGIN } from '../explore/ExploreConstants';
import MovieCard from '../shared/MovieCard';
import { getTrendingToday } from '../../tmdb';

interface SearchEmptyStateProps {
  recentSearches: string[];
  onSelectQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearAllRecents: () => void;
  trendingItems?: any[];
  personalizedItems?: any[];
  toggleWatchlist?: (item: any) => void;
}

const SearchEmptyState = memo(
  ({
    recentSearches,
    onSelectQuery,
    onRemoveRecent,
    onClearAllRecents,
    trendingItems,
    personalizedItems,
    toggleWatchlist,
  }: SearchEmptyStateProps) => {
    const { colors } = useAppTheme();
    const router = useRouter();

    const [localTrending, setLocalTrending] = useState<any[]>(() => {
      if (trendingItems && trendingItems.length > 0) return trendingItems;
      const cached = getExploreContentCacheSync(0);
      return cached?.trendingMovies || cached?.heroMovies || [];
    });

    useEffect(() => {
      if (trendingItems && trendingItems.length > 0) {
        setLocalTrending(trendingItems);
      } else if (localTrending.length === 0) {
        getTrendingToday('all', 1)
          .then((items) => {
            if (items && items.length > 0) setLocalTrending(items);
          })
          .catch(() => {});
      }
    }, [trendingItems]);

    // Personalized search suggestions derived from user's taste, library & history
    const [personalizedSuggestions, setPersonalizedSuggestions] = useState<
      Array<{ label: string; icon: any; query: string }>
    >([]);

    useEffect(() => {
      const suggestions: Array<{ label: string; icon: any; query: string }> = [];

      try {
        // 1. User's saved favorite artists
        const artists = getSavedItems('artist') || [];
        artists.slice(0, 3).forEach((a: any) => {
          const name = a.name || a.title;
          if (name && !suggestions.some((s) => s.query.toLowerCase() === name.toLowerCase())) {
            suggestions.push({
              label: name,
              icon: 'person-outline',
              query: name,
            });
          }
        });

        // 2. Personalized Taste Shelves
        const shelves = getForYouShelvesSync() || [];
        shelves.slice(0, 2).forEach((s) => {
          if (s.title && !suggestions.some((sug) => sug.query.toLowerCase() === s.title.toLowerCase())) {
            suggestions.push({
              label: s.title,
              icon: 'sparkles-outline',
              query: s.title,
            });
          }
        });

        // 3. User's recent watch history
        const history = getSavedItems('history') || [];
        history.slice(0, 2).forEach((h: any) => {
          const title = h.title || h.name;
          if (title && !suggestions.some((s) => s.query.toLowerCase() === title.toLowerCase())) {
            suggestions.push({
              label: title,
              icon: 'film-outline',
              query: title,
            });
          }
        });
      } catch (err) {
        console.warn('Error extracting user search suggestions:', err);
      }

      setPersonalizedSuggestions(suggestions);
    }, []);

    // Dynamic TMDB trending query chips
    const trendingSuggestions = useMemo(() => {
      if (localTrending.length > 0) {
        return localTrending.slice(0, 8).map((item: any) => {
          const title = item.title || item.name || '';
          const genreId = item.genre_ids?.[0];
          return {
            label: title,
            icon: getGenreIcon(genreId),
            query: title,
          };
        });
      }
      return [
        { label: 'Sci-Fi', icon: 'rocket', query: 'Sci-Fi' },
        { label: 'Action Thrillers', icon: 'flame', query: 'Action' },
        { label: 'Anime', icon: 'sparkles', query: 'Anime' },
        { label: 'Comedy', icon: 'happy', query: 'Comedy' },
        { label: 'Crime & Mystery', icon: 'search', query: 'Crime' },
        { label: 'Horror', icon: 'skull', query: 'Horror' },
      ];
    }, [localTrending]);

    const handleSelect = useCallback(
      (query: string) => {
        Haptics.selectionAsync().catch(() => {});
        onSelectQuery(query);
      },
      [onSelectQuery]
    );

    const handleRemove = useCallback(
      (query: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onRemoveRecent(query);
      },
      [onRemoveRecent]
    );

    const handleCardPress = useCallback(
      (item: any) => {
        const mType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        router.push(`/movie/${item.id}?media_type=${mType}`);
      },
      [router]
    );

    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {/* RECENT SEARCHES */}
        {recentSearches.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.titleWithIcon}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Searches</Text>
              </View>
              <TouchableOpacity
                onPress={onClearAllRecents}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={[styles.clearText, { color: colors.textSecondary }]}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pillWrap}>
              {recentSearches.map((item) => (
                <View
                  key={item}
                  style={[styles.recentChip, { backgroundColor: colors.surfaceContainer }]}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleSelect(item)}
                    style={styles.recentChipTextContainer}
                  >
                    <Text style={[styles.recentChipText, { color: colors.text }]} numberOfLines={1}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemove(item)}
                    hitSlop={6}
                    style={styles.removeChipButton}
                  >
                    <Ionicons name="close" size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* PERSONALIZED DISCOVER FOR YOU */}
        {personalizedSuggestions.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.titleWithIcon}>
                <Ionicons name="sparkles" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Suggested For You</Text>
              </View>
            </View>

            <View style={styles.pillWrap}>
              {personalizedSuggestions.map((item) => (
                <TouchableOpacity
                  key={`user-sug-${item.query}`}
                  activeOpacity={0.8}
                  onPress={() => handleSelect(item.query)}
                  style={[styles.trendingChip, { backgroundColor: colors.surfaceContainer }]}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={14}
                    color={colors.primary}
                    style={styles.trendingChipIcon}
                  />
                  <Text style={[styles.trendingChipText, { color: colors.text }]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* PERSONALIZED RECOMMENDATION CARDS RAIL */}
        {personalizedItems && personalizedItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.titleWithIcon}>
                <Ionicons name="film-outline" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Recommended For You</Text>
              </View>
            </View>

            <FlatList
              horizontal
              data={personalizedItems.slice(0, 10)}
              keyExtractor={(item) => `search-rec-${item.id}`}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={styles.horizontalCardsContent}
              renderItem={({ item }) => (
                <MovieCard
                  item={item}
                  onPress={() => handleCardPress(item)}
                  toggleWatchlist={toggleWatchlist}
                />
              )}
            />
          </View>
        )}

        {/* TMDB DYNAMIC TRENDING DISCOVER */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleWithIcon}>
              <Feather name="trending-up" size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending & Discover</Text>
            </View>
          </View>

          <View style={styles.pillWrap}>
            {trendingSuggestions.map((item, idx) => (
              <TouchableOpacity
                key={`trending-sug-${idx}-${item.query}`}
                activeOpacity={0.8}
                onPress={() => handleSelect(item.query)}
                style={[styles.trendingChip, { backgroundColor: colors.surfaceContainer }]}
              >
                <Ionicons
                  name={item.icon as any}
                  size={14}
                  color={colors.primary}
                  style={styles.trendingChipIcon}
                />
                <Text style={[styles.trendingChipText, { color: colors.text }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* TMDB TRENDING NOW CARDS RAIL */}
        {localTrending.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.titleWithIcon}>
                <Ionicons name="flame" size={16} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Trending Today</Text>
              </View>
            </View>

            <FlatList
              horizontal
              data={localTrending.slice(0, 10)}
              keyExtractor={(item) => `search-trending-${item.id}`}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              contentContainerStyle={styles.horizontalCardsContent}
              renderItem={({ item }) => (
                <MovieCard
                  item={item}
                  onPress={() => handleCardPress(item)}
                  toggleWatchlist={toggleWatchlist}
                />
              )}
            />
          </View>
        )}
      </ScrollView>
    );
  }
);

export default SearchEmptyState;

const styles = StyleSheet.create({
  container: {
    paddingTop: (StatusBar.currentHeight || 0) + 76,
    paddingBottom: 60,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: HORIZONTAL_MARGIN,
  },
  horizontalCardsContent: {
    paddingHorizontal: HORIZONTAL_MARGIN,
    paddingVertical: 6,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 0,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recentChipTextContainer: {
    maxWidth: 220,
  },
  recentChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  removeChipButton: {
    marginLeft: 6,
    padding: 2,
  },
  trendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  trendingChipIcon: {
    marginRight: 6,
  },
  trendingChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
