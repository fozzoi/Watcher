import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRecentTasteEvents,
  insertTasteEvent,
  saveForYouShelves,
  getForYouCachedShelves,
  getForYouCacheLastUpdated,
  getSavedItems,
  restoreTasteEvents,
  TasteEventRecord,
} from '../database';
import {
  discoverMovies,
  getPersonCombinedCredits,
  getCollectionDetails,
  getMovieCollectionId,
  TMDBResult,
} from '../tmdb';

// ==========================================
// 1. EVENT WEIGHTS (14-Day Exponential Half-Life)
// ==========================================
export const TASTE_WEIGHTS = {
  TORRENT_DOWNLOAD: 5.0, // Committed storage/bandwidth
  COMPLETED_WATCH: 4.0,  // Watched > 75%
  WATCHLIST_ADD: 3.5,    // Direct high intent
  FAVORITE_ARTIST: 3.5,  // Follows person
  SEARCH_CLICK: 2.0,     // Intent-driven pick
  VISIT_CAST_PAGE: 1.5,  // Browsing curiosity
  DROPPED_EARLY: -2.5,   // Stopped < 15 mins (Negative signal)
};

export interface TasteEventInput {
  entity_type: 'cast' | 'director' | 'movie' | 'tv' | 'search' | 'download';
  entity_id: string | number;
  entity_name?: string;
  genres?: string | number[] | { id: number; name?: string }[];
  keywords?: string | number[];
  weight: number;
}

export interface ForYouShelf {
  shelfId: string;
  title: string;
  subtitle?: string | null;
  items: any[];
  sortOrder: number;
  updatedAt: number;
}

// Memory throttle to prevent event spamming (e.g. rapid taps)
const recentLoggedEvents = new Map<string, number>();

/**
 * Log a user action to SQLite silently without blocking the UI thread.
 * Zero-cost write (< 1ms).
 */
export const logTasteEvent = (input: TasteEventInput) => {
  try {
    const entityId = String(input.entity_id);
    const throttleKey = `${input.entity_type}:${entityId}:${input.weight}`;
    const now = Date.now();
    const lastTime = recentLoggedEvents.get(throttleKey);

    // Throttle identical actions within 10 minutes
    if (lastTime && now - lastTime < 10 * 60 * 1000) {
      return;
    }
    recentLoggedEvents.set(throttleKey, now);

    // Evict old throttle keys if map grows
    if (recentLoggedEvents.size > 200) {
      for (const [key, timestamp] of recentLoggedEvents.entries()) {
        if (now - timestamp > 60 * 60 * 1000) {
          recentLoggedEvents.delete(key);
        }
      }
    }

    // Normalize genres to comma-separated list
    let genresStr: string | null = null;
    if (typeof input.genres === 'string') {
      genresStr = input.genres;
    } else if (Array.isArray(input.genres)) {
      genresStr = input.genres
        .map((g: any) => (typeof g === 'object' && g !== null ? g.id : g))
        .filter((g: any) => g !== undefined && g !== null)
        .join(',');
    }

    // Normalize keywords
    let keywordsStr: string | null = null;
    if (typeof input.keywords === 'string') {
      keywordsStr = input.keywords;
    } else if (Array.isArray(input.keywords)) {
      keywordsStr = input.keywords.join(',');
    }

    insertTasteEvent({
      entity_type: input.entity_type,
      entity_id: entityId,
      entity_name: input.entity_name || null,
      genres: genresStr,
      keywords: keywordsStr,
      weight: input.weight,
      timestamp: now,
    });
  } catch (error) {
    console.warn('logTasteEvent suppressed error:', error);
  }
};

// ==========================================
// 2. TASTE VECTOR SYNTHESIS (Time-Decayed Half-Life)
// ==========================================
export function calculateTasteProfile(events: TasteEventRecord[]) {
  const now = Date.now();
  const DAY_MS = 86400000;

  const genreScores: Record<string, number> = {};
  const personScores: Record<string, { name: string; score: number; type: string }> = {};

  for (const ev of events) {
    const daysAgo = Math.max(0, (now - ev.timestamp) / DAY_MS);
    // Half-life of 14 days: 2 weeks ago is 50%, 4 weeks ago is 25%
    const decay = Math.pow(0.5, daysAgo / 14);
    const finalScore = ev.weight * decay;

    // Aggregate Genres
    if (ev.genres) {
      ev.genres.split(',').forEach((g) => {
        const cleanG = g.trim();
        if (cleanG) {
          genreScores[cleanG] = (genreScores[cleanG] || 0) + finalScore;
        }
      });
    }

    // Aggregate Cast & Directors
    if (ev.entity_type === 'cast' || ev.entity_type === 'director') {
      const existing = personScores[ev.entity_id] || {
        name: ev.entity_name || 'Artist',
        score: 0,
        type: ev.entity_type,
      };
      existing.score += finalScore;
      if (ev.entity_name && !existing.name) existing.name = ev.entity_name;
      personScores[ev.entity_id] = existing;
    }
  }

  // Cold-start fallback from SQLite library if fewer than 3 events
  if (events.length < 3) {
    try {
      const history = getSavedItems('history') || [];
      const watchlist = getSavedItems('watchlist') || [];
      const artists = getSavedItems('artist') || [];

      // Add artists
      artists.forEach((a: any) => {
        if (a.id) {
          const id = String(a.id);
          personScores[id] = {
            name: a.name || 'Artist',
            score: (personScores[id]?.score || 0) + TASTE_WEIGHTS.FAVORITE_ARTIST,
            type: 'cast',
          };
        }
      });

      // Add recent history genres
      history.slice(0, 10).forEach((item: any) => {
        const itemGenres = item.genres || item.genre_ids || [];
        itemGenres.forEach((g: any) => {
          const gId = String(typeof g === 'object' ? g.id : g);
          if (gId) genreScores[gId] = (genreScores[gId] || 0) + 3.0;
        });
      });

      // Add watchlist genres
      watchlist.slice(0, 10).forEach((item: any) => {
        const itemGenres = item.genres || item.genre_ids || [];
        itemGenres.forEach((g: any) => {
          const gId = String(typeof g === 'object' ? g.id : g);
          if (gId) genreScores[gId] = (genreScores[gId] || 0) + 2.0;
        });
      });
    } catch {
      // Non-blocking fallback
    }
  }

  const topGenres = Object.entries(genreScores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  const topPeople = Object.entries(personScores)
    .filter(([_, p]) => p.score > 0)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 2)
    .map(([id, p]) => ({ id, ...p }));

  return { topGenres, topPeople, genreScores };
}

// ==========================================
// 3. TARGETED DISCOVERY GENERATION (RELEASED ONLY)
// ==========================================

export const getTodayDateString = (): string => {
  return new Date().toISOString().split('T')[0];
};

/**
 * Checks if a movie or TV show has already been released.
 * Strictly excludes upcoming, unannounced, unreleased movies, or future release dates.
 */
export const isMediaReleased = (item: any, todayStr?: string): boolean => {
  if (!item) return false;
  const today = todayStr || getTodayDateString();
  const date = item.release_date || item.first_air_date;
  if (!date || typeof date !== 'string' || date.trim() === '') return false;
  // If release date is in the future, it is unreleased
  if (date > today) return false;
  // If status indicates unreleased production stages, exclude it
  if (item.status && ['Planned', 'In Production', 'Post Production'].includes(item.status)) {
    return false;
  }
  // Must have a valid poster image to be a high-quality suggestion
  if (!item.poster_path) return false;
  return true;
};

export async function generateForYouShelves(): Promise<ForYouShelf[]> {
  try {
    const todayStr = getTodayDateString();
    const history = getSavedItems('history') || [];
    const watchedIds = new Set<number>(
      history.map((i: any) => Number(i.id ?? i.media_id)).filter((id: number) => !isNaN(id))
    );

    const recentEvents = getRecentTasteEvents(300);
    const { topGenres, topPeople, genreScores } = calculateTasteProfile(recentEvents);

    const shelves: {
      shelf_id: string;
      title: string;
      subtitle?: string | null;
      items: any[];
      sort_order: number;
    }[] = [];

    let sortOrder = 0;

    // --- Iconic Franchises mapping by Genre ID (TMDB Collection IDs) ---
    const ICONIC_FRANCHISES_BY_GENRE: Record<number, number[]> = {
      878: [724855, 2344, 173710, 8091, 480261], // Sci-Fi: Dune, Matrix, Planet of the Apes, Alien, Blade Runner
      28: [404609, 263, 87359, 8945, 531330], // Action: John Wick, Dark Knight, Mission Impossible, Mad Max, Top Gun
      12: [119, 1241, 295, 87096, 10], // Adventure: Lord of the Rings, Harry Potter, Pirates, Avatar, Star Wars
      14: [119, 1241, 295], // Fantasy: Lord of the Rings, Harry Potter, Pirates
      16: [618529, 12, 10194, 77816], // Animation: Spider-Verse, Shrek, Toy Story, Kung Fu Panda
      27: [726871, 313086, 1157], // Horror: A Quiet Place, Conjuring, Saw
      53: [87359, 404609, 871131], // Thriller: Mission Impossible, John Wick, Knives Out
      80: [230, 871131, 263], // Crime: Godfather, Knives Out, Dark Knight
    };

    const DEFAULT_POPULAR_FRANCHISES = [
      724855, // Dune Collection
      404609, // John Wick Collection
      263,    // The Dark Knight Collection
      119,    // The Lord of the Rings Collection
      618529, // Spider-Man (Spider-Verse) Collection
      87359,  // Mission: Impossible Collection
      1241,   // Harry Potter Collection
      173710, // Planet of the Apes Collection
      2344,   // The Matrix Collection
    ];

    // --- Shelf 1: "Continue The Saga" (Unified Mixed Multi-Franchise Continuations) ---
    try {
      const watchlist = getSavedItems('watchlist') || [];
      const collectionIdSet = new Set<number>();

      // A) Extract collections from history
      history.slice(0, 30).forEach((item: any) => {
        const cId = item.belongs_to_collection?.id || item.collection_id;
        if (cId) collectionIdSet.add(Number(cId));
      });

      // B) Extract collections from watchlist
      watchlist.slice(0, 20).forEach((item: any) => {
        const cId =
          item.belongs_to_collection?.id ||
          item.collection_id ||
          (item.media_type === 'collection' ? item.id : null);
        if (cId) collectionIdSet.add(Number(cId));
      });

      // C) For recent history movies without explicit collection object, inspect details
      const moviesToCheck = history
        .filter((i: any) => !i.belongs_to_collection && !i.collection_id && i.media_type !== 'tv')
        .slice(0, 8);

      if (moviesToCheck.length > 0) {
        const collectionIds = await Promise.all(
          moviesToCheck.map(async (m: any) => {
            return await getMovieCollectionId(Number(m.id));
          })
        );
        collectionIds.forEach((cId) => {
          if (cId) {
            collectionIdSet.add(cId);
          }
        });
      }

      const startedCollectionIdSet = new Set<number>(collectionIdSet);

      // Fetch collection details for all discovered started collections
      const startedCollectionDetails = (
        await Promise.all(
          Array.from(collectionIdSet).map(async (colId) => {
            try {
              return await getCollectionDetails(colId);
            } catch {
              return null;
            }
          })
        )
      ).filter(Boolean);

      const candidateSagaMovies: any[] = [];
      const seenSagaMovieIds = new Set<number>();

      for (const col of startedCollectionDetails) {
        if (!col || !col.parts || col.parts.length <= 1) continue;
        const unwatched = col.parts.filter(
          (part: any) => !watchedIds.has(Number(part.id)) && isMediaReleased(part, todayStr)
        );
        for (const part of unwatched) {
          const partId = Number(part.id);
          if (!seenSagaMovieIds.has(partId)) {
            seenSagaMovieIds.add(partId);
            candidateSagaMovies.push({
              ...part,
              _colId: Number(col.id),
              _colName: col.name,
              _isStarted: true,
            });
          }
        }
      }

      // If started franchises have fewer than 10 movies, supplement with premier franchises matching user's top genres
      if (candidateSagaMovies.length < 10) {
        const supplementalCollectionIds: number[] = [];
        topGenres.forEach((gId) => {
          const list = ICONIC_FRANCHISES_BY_GENRE[Number(gId)];
          if (list) supplementalCollectionIds.push(...list);
        });
        supplementalCollectionIds.push(...DEFAULT_POPULAR_FRANCHISES);

        for (const candId of supplementalCollectionIds) {
          if (candidateSagaMovies.length >= 25) break;
          if (collectionIdSet.has(candId)) continue;
          collectionIdSet.add(candId);

          try {
            const candCol = await getCollectionDetails(candId);
            if (candCol?.parts && candCol.parts.length > 1) {
              const unwatched = candCol.parts.filter(
                (p: any) => !watchedIds.has(Number(p.id)) && isMediaReleased(p, todayStr)
              );
              for (const part of unwatched) {
                const partId = Number(part.id);
                if (!seenSagaMovieIds.has(partId)) {
                  seenSagaMovieIds.add(partId);
                  candidateSagaMovies.push({
                    ...part,
                    _colId: Number(candCol.id),
                    _colName: candCol.name,
                    _isStarted: false,
                  });
                }
                if (candidateSagaMovies.length >= 25) break;
              }
            }
          } catch {
            // Non-blocking
          }
        }
      }

      // Score each candidate movie dynamically:
      // 1. User genre affinity for that particular day/week (14-day exponential decay vector)
      // 2. Critical ratings and vote credibility
      // 3. Started universe bonus (+6.0)
      // 4. Popularity boost
      for (const movie of candidateSagaMovies) {
        const movieGenreIds = (
          movie.genre_ids ||
          (movie.genres ? movie.genres.map((g: any) => g.id || g) : [])
        ).map(String);

        let genreAffinity = 0;
        for (const gId of movieGenreIds) {
          if (genreScores && genreScores[gId]) {
            genreAffinity += genreScores[gId];
          }
        }

        const voteAvg = Number(movie.vote_average) || 0;
        const voteCount = Number(movie.vote_count) || 0;
        const popularity = Number(movie.popularity) || 0;
        const voteCredibility = Math.min(1.0, voteCount / 300);
        const ratingWeight = (voteAvg * 1.5) * (0.4 + 0.6 * voteCredibility);
        const startedBonus = movie._isStarted ? 6.0 : 0.0;
        const popularityBoost = Math.log10(Math.max(1, popularity)) * 0.5;

        movie._score = (genreAffinity * 2.0) + ratingWeight + startedBonus + popularityBoost;
      }

      // Mix and interleave franchises:
      // Soft penalty per already-picked title from the same franchise so top sequels across multiple sagas interleave smoothly
      const selectedSagaMovies: any[] = [];
      const franchisePickedCount = new Map<number, number>();
      const sortedCandidates = [...candidateSagaMovies].sort((a, b) => b._score - a._score);

      while (sortedCandidates.length > 0 && selectedSagaMovies.length < 20) {
        let bestIndex = 0;
        let bestEffectiveScore = -Infinity;

        for (let i = 0; i < sortedCandidates.length; i++) {
          const cand = sortedCandidates[i];
          const previousCount = franchisePickedCount.get(cand._colId) || 0;
          const effectiveScore = cand._score - (previousCount * 2.5);
          if (effectiveScore > bestEffectiveScore) {
            bestEffectiveScore = effectiveScore;
            bestIndex = i;
          }
        }

        const [picked] = sortedCandidates.splice(bestIndex, 1);
        franchisePickedCount.set(picked._colId, (franchisePickedCount.get(picked._colId) || 0) + 1);
        const { _score, _colId, _colName, _isStarted, ...cleanMovie } = picked;
        selectedSagaMovies.push(cleanMovie);
      }

      // 1. Single Unified Master "Continue The Saga" shelf
      if (selectedSagaMovies.length > 0) {
        shelves.push({
          shelf_id: 'saga-all',
          title: 'Continue The Saga',
          subtitle: 'Next chapters tailored to your taste and ratings',
          items: selectedSagaMovies,
          sort_order: sortOrder++,
        });
      }
    } catch (e) {
      console.warn('Franchise saga shelf generation warning:', e);
    }

    // --- Shelf 2: "Because You Follow [Person]" ---
    for (const person of topPeople) {
      try {
        let movies: TMDBResult[] = await discoverMovies({
          with_people: person.id,
          sort_by: 'vote_average.desc',
          'vote_count.gte': 80,
          'primary_release_date.lte': todayStr,
        });

        // Fallback to combined credits if discover count is low
        if (movies.length < 4) {
          const credits = await getPersonCombinedCredits(Number(person.id));
          movies = credits.filter((m) => m.poster_path && (m.vote_count || 0) >= 30);
        }

        const unwatched = movies.filter(
          (m) => !watchedIds.has(Number(m.id)) && isMediaReleased(m, todayStr)
        );
        if (unwatched.length >= 3) {
          shelves.push({
            shelf_id: `person-${person.id}`,
            title: `Because You Follow ${person.name}`,
            subtitle: `Critically acclaimed works starring or directed by ${person.name}`,
            items: unwatched.slice(0, 15),
            sort_order: sortOrder++,
          });
        }
      } catch (e) {
        console.warn('Person spotlight shelf generation warning:', e);
      }
    }

    // --- Shelf 3: "Your Sweet Spot" (Top 2 Genres Vibe) ---
    if (topGenres.length >= 2) {
      try {
        const sweetMovies = await discoverMovies({
          with_genres: `${topGenres[0]},${topGenres[1]}`,
          'vote_average.gte': 6.8,
          'vote_count.gte': 200,
          sort_by: 'popularity.desc',
          'primary_release_date.lte': todayStr,
        });

        const unwatched = sweetMovies.filter(
          (m) => !watchedIds.has(Number(m.id)) && isMediaReleased(m, todayStr)
        );
        if (unwatched.length >= 4) {
          shelves.push({
            shelf_id: 'sweet-spot',
            title: 'Your Sweet Spot',
            subtitle: 'High-confidence picks tailored to your vibe',
            items: unwatched.slice(0, 15),
            sort_order: sortOrder++,
          });
        }
      } catch (e) {
        console.warn('Sweet spot shelf generation warning:', e);
      }
    }

    // --- Shelf 4: "Top Picks For You" (Top Genre Spotlight) ---
    if (topGenres.length >= 1) {
      try {
        const topGenreMovies = await discoverMovies({
          with_genres: topGenres[0],
          'vote_average.gte': 7.0,
          'vote_count.gte': 250,
          sort_by: 'popularity.desc',
          'primary_release_date.lte': todayStr,
        });

        const unwatched = topGenreMovies.filter(
          (m) => !watchedIds.has(Number(m.id)) && isMediaReleased(m, todayStr)
        );
        if (unwatched.length >= 4) {
          shelves.push({
            shelf_id: `top-picks-${topGenres[0]}`,
            title: 'Top Picks For You',
            subtitle: 'Handpicked highlights matching your recent watches',
            items: unwatched.slice(0, 15),
            sort_order: sortOrder++,
          });
        }
      } catch (e) {
        console.warn('Top picks shelf generation warning:', e);
      }
    }

    // Cache shelves in SQLite
    if (shelves.length > 0) {
      saveForYouShelves(shelves);
    }

    return getForYouCachedShelves();
  } catch (error) {
    console.error('Failed to generate for_you shelves:', error);
    return getForYouCachedShelves();
  }
}

// ==========================================
// 4. INSTANT READ (< 5ms) & BACKGROUND REFRESH
// ==========================================

export const getForYouShelvesSync = (): ForYouShelf[] => {
  return getForYouCachedShelves();
};

const forYouListeners = new Set<(shelves: ForYouShelf[]) => void>();

export const subscribeToForYouShelves = (listener: (shelves: ForYouShelf[]) => void) => {
  forYouListeners.add(listener);
  return () => {
    forYouListeners.delete(listener);
  };
};

export const notifyForYouListeners = (shelves: ForYouShelf[]) => {
  for (const listener of forYouListeners) {
    try {
      listener(shelves);
    } catch (e) {
      console.warn('ForYou listener error:', e);
    }
  }
};

let isRefreshing = false;

/**
 * Triggers background refresh if cache is empty or older than 12 hours.
 * Runs non-blocking on idle so Explore screen stays at 60/120 FPS.
 */
export const refreshForYouShelvesIfNeeded = async (forceRefresh: boolean = false) => {
  if (isRefreshing) return;

  const lastUpdated = getForYouCacheLastUpdated();
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const isStale = !lastUpdated || Date.now() - lastUpdated > TWELVE_HOURS_MS;

  if (!forceRefresh && !isStale) {
    return;
  }

  isRefreshing = true;
  try {
    const updatedShelves = await generateForYouShelves();
    notifyForYouListeners(updatedShelves);
  } catch (error) {
    console.warn('Silent ForYou background sync warning:', error);
  } finally {
    isRefreshing = false;
  }
};

// ==========================================
// 5. LOCAL TELEMETRY & BACKUP HELPERS
// ==========================================

export interface TasteTelemetryPayload {
  version: number;
  events: TasteEventRecord[];
  cachedShelves: ForYouShelf[];
  updatedAt: number;
}

export const getTasteTelemetryForBackup = (): TasteTelemetryPayload => {
  try {
    const events = getRecentTasteEvents(300);
    const cachedShelves = getForYouCachedShelves();
    return {
      version: 1,
      events,
      cachedShelves,
      updatedAt: Date.now(),
    };
  } catch (e) {
    return { version: 1, events: [], cachedShelves: [], updatedAt: Date.now() };
  }
};

export const restoreTasteTelemetryFromCloud = (payload: any) => {
  if (!payload || typeof payload !== 'object') return;
  try {
    if (Array.isArray(payload.events) && payload.events.length > 0) {
      restoreTasteEvents(payload.events);
    }
    if (Array.isArray(payload.cachedShelves) && payload.cachedShelves.length > 0) {
      const currentLastUpdated = getForYouCacheLastUpdated();
      const incomingUpdatedAt = Number(payload.updatedAt) || 0;
      if (currentLastUpdated <= 0 || incomingUpdatedAt > currentLastUpdated) {
        saveForYouShelves(payload.cachedShelves);
        notifyForYouListeners(payload.cachedShelves);
      }
    }
  } catch (e) {
    console.warn('Failed to restore taste telemetry:', e);
  }
};

export const syncTasteTelemetryToCloudIfNeeded = async (_force: boolean = false): Promise<boolean> => {
  // Telemetry is isolated to SQLite and exported in Settings JSON backup.
  // It does not pollute or block the cloud mutation outbox.
  return true;
};
