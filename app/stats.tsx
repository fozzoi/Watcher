import React, { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  StatusBar,
  Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { getSavedItems } from '../src/database';
import Animated, { FadeInDown } from 'react-native-reanimated';

const ACCENT = '#E50914';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

type GenreStat = {
  name: string;
  count: number;
  percent: number;
};

type ActorStat = {
  name: string;
  count: number;
};

type StatData = {
  totalMovies: number;
  totalTv: number;
  totalWatched: number;
  totalRuntimeHours: number;
  totalRuntimeDays: string;
  topGenre: string;
  topGenresList: GenreStat[];
  topActorsList: ActorStat[];
  watchlistSize: number;
  historySize: number;
  completionRate: number;
  movieRatio: number;
  tvRatio: number;
  milestoneTitle: string;
  milestoneIcon: keyof typeof Ionicons.glyphMap;
  milestoneDesc: string;
};

export default function StatsPage() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatData | null>(null);

  const loadStats = useCallback(() => {
    try {
      setLoading(true);
      const history: any[] = getSavedItems('history') || [];
      const watchlist: any[] = getSavedItems('watchlist') || [];
      const artists: any[] = getSavedItems('artist') || [];

      let totalMovies = 0;
      let totalTv = 0;
      let totalRuntimeMinutes = 0;
      const genres: Record<string, number> = {};
      const actors: Record<string, number> = {};

      for (const item of history) {
        const isTv = item.media_type === 'tv' || !!item.first_air_date || item.lastSeason !== undefined;
        if (isTv) totalTv++;
        else totalMovies++;

        // Accurate runtime proxy: movies ~110m, TV episode ~45m if runtime not recorded
        const runtime = item.runtime || item.episode_run_time?.[0] || (isTv ? 45 : 110);
        totalRuntimeMinutes += runtime;

        // Process genre objects or genre_ids
        if (item.genres && Array.isArray(item.genres)) {
          item.genres.forEach((g: any) => {
            const name = typeof g === 'string' ? g : g?.name;
            if (name) genres[name] = (genres[name] || 0) + 1;
          });
        } else if (item.genre_ids && Array.isArray(item.genre_ids)) {
          item.genre_ids.forEach((id: number) => {
            const name = GENRE_MAP[id];
            if (name) genres[name] = (genres[name] || 0) + 1;
          });
        }

        // Process cast members if available
        if (item.cast && Array.isArray(item.cast)) {
          item.cast.slice(0, 4).forEach((actor: any) => {
            const name = actor?.name;
            if (name) actors[name] = (actors[name] || 0) + 1;
          });
        }
      }

      // Merge saved favorite artists into actors breakdown if list is sparse
      artists.forEach((art: any) => {
        if (art?.name) {
          actors[art.name] = (actors[art.name] || 0) + 1;
        }
      });

      // Genre sorting
      const sortedGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]);
      const topGenre = sortedGenres[0]?.[0] || 'Eclectic Cinema';
      const totalGenreHits = sortedGenres.reduce((acc, curr) => acc + curr[1], 0) || 1;

      const topGenresList: GenreStat[] = sortedGenres.slice(0, 6).map(([name, count]) => ({
        name,
        count,
        percent: Math.round((count / totalGenreHits) * 100),
      }));

      // Actor sorting
      const topActorsList: ActorStat[] = Object.entries(actors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const totalWatched = totalMovies + totalTv;
      const totalTracked = totalWatched + watchlist.length;
      const completionRate = totalTracked > 0 ? Math.round((totalWatched / totalTracked) * 100) : 0;

      const movieRatio = totalWatched > 0 ? Math.round((totalMovies / totalWatched) * 100) : 50;
      const tvRatio = 100 - movieRatio;

      // Milestone calculation
      let milestoneTitle = 'Cinema Explorer';
      let milestoneIcon: keyof typeof Ionicons.glyphMap = 'compass';
      let milestoneDesc = 'Embarking on your cinema journey';

      if (totalWatched >= 100) {
        milestoneTitle = 'Legendary Screen Buff';
        milestoneIcon = 'diamond';
        milestoneDesc = 'Elite cinema curator with encyclopedic taste';
      } else if (totalWatched >= 50) {
        milestoneTitle = 'Master Cinephile';
        milestoneIcon = 'trophy';
        milestoneDesc = 'Deep dedication across genres and eras';
      } else if (totalWatched >= 25) {
        milestoneTitle = 'Avid Binger';
        milestoneIcon = 'flame';
        milestoneDesc = 'Regular cinematic explorer of films & shows';
      } else if (totalWatched >= 10) {
        milestoneTitle = 'Film Enthusiast';
        milestoneIcon = 'film';
        milestoneDesc = 'Building an impressive and diverse library';
      }

      setStats({
        totalMovies,
        totalTv,
        totalWatched,
        totalRuntimeHours: Math.round(totalRuntimeMinutes / 60),
        totalRuntimeDays: (totalRuntimeMinutes / (60 * 24)).toFixed(1),
        topGenre,
        topGenresList,
        topActorsList,
        watchlistSize: watchlist.length,
        historySize: history.length,
        completionRate,
        movieRatio,
        tvRatio,
        milestoneTitle,
        milestoneIcon,
        milestoneDesc,
      });
    } catch (e) {
      console.error('Failed to calculate stats:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading || !stats) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header Bar */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.backBtn}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>Cinematic Stats</Text>
          <Text style={styles.headerSubtitle}>Personal viewing metrics & habits</Text>
        </View>

        <TouchableOpacity 
          onPress={loadStats} 
          style={styles.reloadBtn}
          accessibilityLabel="Refresh stats"
        >
          <Ionicons name="reload-outline" size={20} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Milestone Banner */}
        <Animated.View entering={FadeInDown.delay(50)} style={styles.milestoneCard}>
          <LinearGradient 
            colors={['rgba(229,9,20,0.22)', 'rgba(20,20,25,0.85)']} 
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill} 
          />
          <View style={styles.milestoneContent}>
            <View style={styles.milestoneLeft}>
              <View style={styles.milestoneBadgeRow}>
                <Ionicons name="sparkles" size={12} color="#FFD700" />
                <Text style={styles.milestoneBadgeText}>MILESTONE RANK</Text>
              </View>
              <Text style={styles.milestoneTitle}>{stats.milestoneTitle}</Text>
              <Text style={styles.milestoneDesc}>{stats.milestoneDesc}</Text>
            </View>

            <View style={styles.milestoneIconBox}>
              <Ionicons name={stats.milestoneIcon} size={30} color={ACCENT} />
            </View>
          </View>

          {/* Mini Milestone Stats Pill Row */}
          <View style={styles.milestoneFooterRow}>
            <View style={styles.milestoneFooterPill}>
              <Text style={styles.milestoneFooterNum}>{stats.totalWatched}</Text>
              <Text style={styles.milestoneFooterLabel}>Watched</Text>
            </View>
            <View style={styles.milestoneDivider} />
            <View style={styles.milestoneFooterPill}>
              <Text style={styles.milestoneFooterNum}>{stats.totalRuntimeHours}h</Text>
              <Text style={styles.milestoneFooterLabel}>Screen Time</Text>
            </View>
            <View style={styles.milestoneDivider} />
            <View style={styles.milestoneFooterPill}>
              <Text style={styles.milestoneFooterNum}>{stats.completionRate}%</Text>
              <Text style={styles.milestoneFooterLabel}>Cleared</Text>
            </View>
          </View>
        </Animated.View>

        {/* 2x2 Metric Cards Grid */}
        <View style={styles.metricGrid}>
          {/* Movies Watched */}
          <Animated.View entering={FadeInDown.delay(100)} style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(229,9,20,0.15)' }]}>
              <Ionicons name="film" size={20} color={ACCENT} />
            </View>
            <Text style={styles.metricValue}>{stats.totalMovies}</Text>
            <Text style={styles.metricLabel}>Movies Watched</Text>
          </Animated.View>

          {/* TV Series Watched */}
          <Animated.View entering={FadeInDown.delay(150)} style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(48,209,88,0.15)' }]}>
              <Ionicons name="tv" size={20} color="#30D158" />
            </View>
            <Text style={styles.metricValue}>{stats.totalTv}</Text>
            <Text style={styles.metricLabel}>TV Shows Watched</Text>
          </Animated.View>

          {/* Total Watch Time */}
          <Animated.View entering={FadeInDown.delay(200)} style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(255,214,10,0.15)' }]}>
              <Ionicons name="time" size={20} color="#FFD60A" />
            </View>
            <Text style={styles.metricValue}>{stats.totalRuntimeHours}h</Text>
            <Text style={styles.metricLabel}>~{stats.totalRuntimeDays} Total Days</Text>
          </Animated.View>

          {/* Watchlist & Completion */}
          <Animated.View entering={FadeInDown.delay(250)} style={styles.metricCard}>
            <View style={[styles.metricIconWrap, { backgroundColor: 'rgba(191,90,242,0.15)' }]}>
              <Ionicons name="bookmark" size={20} color="#BF5AF2" />
            </View>
            <Text style={styles.metricValue}>{stats.watchlistSize}</Text>
            <Text style={styles.metricLabel}>In Watchlist ({stats.completionRate}% Done)</Text>
          </Animated.View>
        </View>

        {/* Media Ratio Split Bar */}
        {stats.totalWatched > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="pie-chart" size={18} color={ACCENT} />
              <Text style={styles.sectionTitle}>Media Type Split</Text>
            </View>

            <View style={styles.ratioBarTrack}>
              <View style={[styles.ratioBarFillMovies, { width: `${stats.movieRatio}%` }]} />
              <View style={[styles.ratioBarFillTv, { width: `${stats.tvRatio}%` }]} />
            </View>

            <View style={styles.ratioLegendRow}>
              <View style={styles.ratioLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: ACCENT }]} />
                <Text style={styles.ratioLegendText}>
                  Movies: <Text style={styles.boldText}>{stats.totalMovies}</Text> ({stats.movieRatio}%)
                </Text>
              </View>

              <View style={styles.ratioLegendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#30D158' }]} />
                <Text style={styles.ratioLegendText}>
                  TV Shows: <Text style={styles.boldText}>{stats.totalTv}</Text> ({stats.tvRatio}%)
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Top Genres Breakdown with Progress Bars */}
        <Animated.View entering={FadeInDown.delay(350)} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="trending-up" size={18} color={ACCENT} />
            <Text style={styles.sectionTitle}>Top Genres Breakdown</Text>
          </View>

          {stats.topGenresList.length > 0 ? (
            <View style={styles.genreList}>
              {stats.topGenresList.map((g, index) => (
                <View key={g.name} style={styles.genreRow}>
                  <View style={styles.genreLabelRow}>
                    <Text style={styles.genreName}>
                      {index === 0 ? '👑 ' : ''}{g.name}
                    </Text>
                    <Text style={styles.genreMeta}>
                      {g.count} titles <Text style={styles.genrePercent}>({g.percent}%)</Text>
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <LinearGradient
                      colors={index === 0 ? ['#E50914', '#FF453A'] : ['#BF5AF2', '#5E5CE6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressFill, { width: `${Math.max(10, g.percent)}%` }]}
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Log titles to your viewing history to generate an accurate genre breakdown.
            </Text>
          )}
        </Animated.View>

        {/* Most Watched Stars / Favorite Actors */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.sectionCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="star" size={18} color="#FFD60A" />
            <Text style={styles.sectionTitle}>Top Stars & Actors</Text>
          </View>

          {stats.topActorsList.length > 0 ? (
            <View style={styles.actorsList}>
              {stats.topActorsList.map((actor, idx) => {
                const isFirst = idx === 0;
                const isSecond = idx === 1;
                const isThird = idx === 2;

                const rankBg = isFirst 
                  ? '#FFD60A' 
                  : isSecond 
                  ? '#C0C0C0' 
                  : isThird 
                  ? '#CD7F32' 
                  : 'rgba(255,255,255,0.12)';

                const rankTextColor = (isFirst || isSecond || isThird) ? '#0A0A0F' : '#FFFFFF';

                return (
                  <View key={actor.name} style={styles.actorRow}>
                    <View style={[styles.actorRankBadge, { backgroundColor: rankBg }]}>
                      <Text style={[styles.actorRankText, { color: rankTextColor }]}>
                        #{idx + 1}
                      </Text>
                    </View>

                    <Text style={styles.actorName} numberOfLines={1}>
                      {actor.name}
                    </Text>

                    <View style={styles.actorCountBadge}>
                      <Text style={styles.actorCountText}>
                        {actor.count} {actor.count === 1 ? 'title' : 'titles'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.emptyText}>
              Watch titles or star your favorite cinema actors to see them ranked here.
            </Text>
          )}
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  reloadBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitleGroup: {
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  content: {
    padding: 18,
    gap: 16,
  },

  /* Milestone Card */
  milestoneCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.35)',
    overflow: 'hidden',
    padding: 20,
    backgroundColor: '#14141A',
  },
  milestoneContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  milestoneLeft: {
    flex: 1,
    paddingRight: 12,
  },
  milestoneBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,214,10,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  milestoneBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  milestoneTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  milestoneDesc: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12.5,
    marginTop: 3,
    lineHeight: 17,
  },
  milestoneIconBox: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(229,9,20,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  milestoneFooterPill: {
    alignItems: 'center',
  },
  milestoneFooterNum: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  milestoneFooterLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  milestoneDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  /* 2x2 Metric Grid */
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 36 - 12) / 2,
    backgroundColor: '#15151C',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  /* Section Cards */
  sectionCard: {
    backgroundColor: '#15151C',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },

  /* Ratio Split Bar */
  ratioBarTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
  },
  ratioBarFillMovies: {
    height: '100%',
    backgroundColor: ACCENT,
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  ratioBarFillTv: {
    height: '100%',
    backgroundColor: '#30D158',
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  ratioLegendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratioLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  ratioLegendText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
  },
  boldText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Genre Bars */
  genreList: {
    gap: 12,
  },
  genreRow: {
    gap: 6,
  },
  genreLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  genreName: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
  genreMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
  },
  genrePercent: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  progressTrack: {
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3.5,
  },

  /* Actors List */
  actorsList: {
    gap: 10,
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  actorRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorRankText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actorName: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  actorCountBadge: {
    backgroundColor: 'rgba(229,9,20,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.2)',
  },
  actorCountText: {
    color: ACCENT,
    fontSize: 11,
    fontWeight: '700',
  },

  emptyText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: 14,
  },
});
