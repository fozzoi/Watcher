import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown } from 'react-native-reanimated';

const ACCENT = '#E50914';

type StatData = {
  totalMovies: number;
  totalTv: number;
  totalRuntimeHours: number;
  topGenre: string;
  topActor: string;
  streak: number;
  watchlistSize: number;
};

export default function StatsPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatData | null>(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const historyStr = await AsyncStorage.getItem('history');
      const watchlistStr = await AsyncStorage.getItem('watchlist');
      
      const history = historyStr ? JSON.parse(historyStr) : [];
      const watchlist = watchlistStr ? JSON.parse(watchlistStr) : [];

      let totalMovies = 0;
      let totalTv = 0;
      let totalRuntimeMinutes = 0;
      const genres: Record<string, number> = {};
      const actors: Record<string, number> = {};

      // Basic processing (assume history contains basic details if fetched deeply, but we do what we can)
      for (const item of history) {
        if (item.media_type === 'tv' || item.first_air_date) totalTv++;
        else totalMovies++;

        // A proxy for runtime (often we don't save runtime to history, so this might be 0, but good to have ready)
        if (item.runtime) totalRuntimeMinutes += item.runtime;

        if (item.genres) {
          item.genres.forEach((g: any) => {
            genres[g.name] = (genres[g.name] || 0) + 1;
          });
        }
      }

      // Find top genre
      const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

      // (We could parse actors if we stored them in history, but normally we don't. 
      // If favoriteArtists is populated, we can use that instead for now.)
      const artistsStr = await AsyncStorage.getItem('favoriteArtists');
      const artists = artistsStr ? JSON.parse(artistsStr) : [];
      const topActor = artists.length > 0 ? artists[0].name : 'Unknown';

      setStats({
        totalMovies,
        totalTv,
        totalRuntimeHours: Math.round(totalRuntimeMinutes / 60),
        topGenre,
        topActor,
        streak: 1, // Placeholder for streak logic
        watchlistSize: watchlist.length,
      });

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Insights</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Main Stat */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.mainStatCard}>
          <LinearGradient colors={['rgba(229,9,20,0.15)', 'transparent']} style={StyleSheet.absoluteFill} />
          <Text style={styles.mainStatValue}>{stats.totalMovies + stats.totalTv}</Text>
          <Text style={styles.mainStatLabel}>Titles Watched</Text>
        </Animated.View>

        {/* Two Column Stats */}
        <View style={styles.row}>
          <Animated.View entering={FadeInDown.delay(200)} style={styles.statCard}>
            <Ionicons name="film" size={24} color="#aaa" />
            <Text style={styles.cardValue}>{stats.totalMovies}</Text>
            <Text style={styles.cardLabel}>Movies</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(250)} style={styles.statCard}>
            <Ionicons name="tv" size={24} color="#aaa" />
            <Text style={styles.cardValue}>{stats.totalTv}</Text>
            <Text style={styles.cardLabel}>TV Shows</Text>
          </Animated.View>
        </View>

        <View style={styles.row}>
          <Animated.View entering={FadeInDown.delay(300)} style={styles.statCard}>
            <Text style={styles.cardEmoji}>🎭</Text>
            <Text style={styles.cardValueStr} numberOfLines={1}>{stats.topGenre}</Text>
            <Text style={styles.cardLabel}>Top Genre</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(350)} style={styles.statCard}>
            <Text style={styles.cardEmoji}>⭐</Text>
            <Text style={styles.cardValueStr} numberOfLines={1}>{stats.topActor}</Text>
            <Text style={styles.cardLabel}>Favorite Actor</Text>
          </Animated.View>
        </View>

        {/* Watchlist Ratio */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.longCard}>
          <View>
            <Text style={styles.cardValue}>{stats.watchlistSize}</Text>
            <Text style={styles.cardLabel}>Items in Watchlist</Text>
          </View>
          <Ionicons name="bookmark" size={32} color={ACCENT} style={{ opacity: 0.5 }} />
        </Animated.View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  content: { padding: 20, gap: 16 },

  mainStatCard: {
    backgroundColor: '#15151A', borderRadius: 24, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(229,9,20,0.3)',
    overflow: 'hidden',
  },
  mainStatValue: { color: '#fff', fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  mainStatLabel: { color: '#888', fontSize: 16, fontWeight: '600', marginTop: 4 },

  row: { flexDirection: 'row', gap: 16 },
  statCard: {
    flex: 1, backgroundColor: '#15151A', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  cardValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 12 },
  cardValueStr: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 12 },
  cardLabel: { color: '#888', fontSize: 14, fontWeight: '500', marginTop: 4 },
  cardEmoji: { fontSize: 24 },

  longCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#15151A', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  }
});
