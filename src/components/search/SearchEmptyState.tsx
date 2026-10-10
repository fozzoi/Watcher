// src/components/search/SearchEmptyState.tsx
import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface SearchEmptyStateProps {
  recentSearches: string[];
  onSelectQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearAllRecents: () => void;
}

const TRENDING_SEARCHES = [
  { label: 'Christopher Nolan', icon: 'film-outline' },
  { label: 'Cyberpunk', icon: 'planet-outline' },
  { label: 'Oscar Winners', icon: 'trophy-outline' },
  { label: 'Korean Thrillers', icon: 'flash-outline' },
  { label: 'Studio Ghibli', icon: 'sparkles-outline' },
  { label: 'A24 Horror', icon: 'skull-outline' },
  { label: 'Mind-Bending', icon: 'color-wand-outline' },
  { label: 'True Crime', icon: 'finger-print-outline' },
];

const SearchEmptyState = memo(
  ({
    recentSearches,
    onSelectQuery,
    onRemoveRecent,
    onClearAllRecents,
  }: SearchEmptyStateProps) => {
    const handleSelect = (query: string) => {
      Haptics.selectionAsync().catch(() => {});
      onSelectQuery(query);
    };

    const handleRemove = (query: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onRemoveRecent(query);
    };

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
                <Ionicons name="time-outline" size={16} color="#A0A0A0" />
                <Text style={styles.sectionTitle}>Recent Searches</Text>
              </View>
              <TouchableOpacity
                onPress={onClearAllRecents}
                hitSlop={8}
                activeOpacity={0.7}
              >
                <Text style={styles.clearText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.pillWrap}>
              {recentSearches.map((item) => (
                <View key={item} style={styles.recentChip}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleSelect(item)}
                    style={styles.recentChipTextContainer}
                  >
                    <Text style={styles.recentChipText} numberOfLines={1}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRemove(item)}
                    hitSlop={6}
                    style={styles.removeChipButton}
                  >
                    <Ionicons name="close" size={14} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* TRENDING SEARCHES */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.titleWithIcon}>
              <Feather name="trending-up" size={16} color="#E50914" />
              <Text style={styles.sectionTitle}>Trending & Discover</Text>
            </View>
          </View>

          <View style={styles.pillWrap}>
            {TRENDING_SEARCHES.map((item) => (
              <TouchableOpacity
                key={item.label}
                activeOpacity={0.8}
                onPress={() => handleSelect(item.label)}
                style={styles.trendingChip}
              >
                <Ionicons
                  name={item.icon as any}
                  size={14}
                  color="#E50914"
                  style={styles.trendingChipIcon}
                />
                <Text style={styles.trendingChipText}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    );
  }
);

export default SearchEmptyState;

const styles = StyleSheet.create({
  container: {
    paddingTop: 110,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: '#E5E5E7',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clearText: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E22',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2A2A2E',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  recentChipTextContainer: {
    maxWidth: 220,
  },
  recentChipText: {
    color: '#F2F2F7',
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
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#262628',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  trendingChipIcon: {
    marginRight: 6,
  },
  trendingChipText: {
    color: '#D1D1D6',
    fontSize: 13,
    fontWeight: '500',
  },
});