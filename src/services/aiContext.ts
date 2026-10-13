import { getRecentTasteEvents } from '../database';
import { calculateTasteProfile } from './tasteProfile';
import { GENRE_OPTIONS, LANGUAGE_OPTIONS, UserPreferences } from '../userPreferences';

// Comprehensive map of TMDB movie and TV genre IDs to readable genre labels
const TMDB_GENRE_NAMES: Record<number, string> = {
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
  878: 'Science Fiction',
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

export interface BuildAiContextParams {
  userMemory: string;
  aiName?: string;
  userPrefs: UserPreferences | null;
  watchlistTitles: string[];
  watchedTitles: string[];
  watchlistCollections?: string[];
}

export interface EnrichedAiContext {
  enrichedMemory: string;
  enrichedUserPrefs: any;
  timezone: string;
}

/**
 * Resolves a TMDB genre ID to its standard readable English name.
 */
export function getGenreNameById(id: number | string): string {
  const numericId = Number(id);
  const fromOptions = GENRE_OPTIONS.find((g) => g.id === numericId)?.label;
  if (fromOptions) return fromOptions;
  return TMDB_GENRE_NAMES[numericId] || `Genre ${id}`;
}

/**
 * Resolves a language code (e.g. "en", "ml", "hi") to its human-readable cinema description.
 */
export function getLanguageNameByCode(code: string): string {
  const cleanCode = code.toLowerCase().trim();
  const found = LANGUAGE_OPTIONS.find((l) => l.code.toLowerCase() === cleanCode);
  if (found) {
    return `${found.label} (${found.industry})`;
  }
  return cleanCode;
}

/**
 * Synthesizes real-time user taste signals, explicit preferences, library stats,
 * and assistant identity into a high-density, actionable system prompt context for Gemini.
 */
export function buildEnrichedAiContext(params: BuildAiContextParams): EnrichedAiContext {
  const {
    userMemory = '',
    aiName = '',
    userPrefs,
    watchlistTitles = [],
    watchedTitles = [],
    watchlistCollections = [],
  } = params;

  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {}

  // 1. Explicit preferences
  const genreNames = (userPrefs?.genreIds || [])
    .map(getGenreNameById)
    .filter(Boolean);

  const languageNames = (userPrefs?.languages || [])
    .map(getLanguageNameByCode)
    .filter(Boolean);

  const actorNames = (userPrefs?.favoriteActors || [])
    .map((a: any) => (typeof a === 'string' ? a : a?.name))
    .filter(Boolean);

  // 2. Implicit taste profile from real user behavior (watch/download/search events)
  let tasteHabits = '';
  try {
    const recentEvents = getRecentTasteEvents(60);
    const profile = calculateTasteProfile(recentEvents);

    const inferredGenres = (profile.topGenres || [])
      .map(getGenreNameById)
      .filter(Boolean);

    const inferredPeople = (profile.topPeople || [])
      .map((p) => `${p.name} (${p.type})`)
      .filter(Boolean);

    const signals: string[] = [];
    if (inferredGenres.length > 0) {
      signals.push(`Top Genres by Activity: ${inferredGenres.join(', ')}`);
    }
    if (inferredPeople.length > 0) {
      signals.push(`Frequent Artists/Directors: ${inferredPeople.join(', ')}`);
    }
    if (signals.length > 0) {
      tasteHabits = signals.join(' | ');
    }
  } catch (err) {
    // Non-blocking fallback
  }

  // 3. Assemble structured system prompt memory
  const memorySections: string[] = [];

  if (aiName && aiName.trim()) {
    memorySections.push(`[Assistant Identity: The user has named you "${aiName.trim()}". You are their personal cinema companion.]`);
  }

  if (userMemory && userMemory.trim()) {
    memorySections.push(`[Known User Profile & Long-Term Memory: ${userMemory.trim()}]`);
  }

  const explicitPrefs: string[] = [];
  if (languageNames.length > 0) explicitPrefs.push(`Preferred Languages: ${languageNames.join(', ')}`);
  if (genreNames.length > 0) explicitPrefs.push(`Preferred Genres: ${genreNames.join(', ')}`);
  if (actorNames.length > 0) explicitPrefs.push(`Favorite Cast & Directors: ${actorNames.join(', ')}`);
  if (explicitPrefs.length > 0) {
    memorySections.push(`[User Preferences (CRITICAL): ${explicitPrefs.join(' | ')}]`);
  }

  if (tasteHabits) {
    memorySections.push(`[Inferred Taste Signals (From Actual Viewing Habits): ${tasteHabits}]`);
  }

  const libraryStats: string[] = [
    `Watchlist: ${watchlistTitles.length} titles saved`,
    `History: ${watchedTitles.length} titles watched`,
  ];
  if (watchlistCollections.length > 0) {
    libraryStats.push(`Saved Franchises: ${watchlistCollections.slice(0, 15).join(', ')}`);
  }
  memorySections.push(`[Library State: ${libraryStats.join(' | ')}]`);

  // Guardrails & Curation standards injected directly into Gemini's instruction
  memorySections.push(
    `[Task Guidelines]:\n` +
    `- For movie recommendations: Always format titles strictly as "Title (Year)" (e.g., "Inception (2010)").\n` +
    `- In the "text" field, provide a punchy 1-2 sentence curated note explaining WHY these choices match the user's requested vibe, theme, or director style. Avoid bland fillers like "Here are some movies you might like:".\n` +
    `- Strictly respect the user's preferred languages unless they explicitly ask for foreign or global cinema.\n` +
    `- Never recommend titles the user has already watched or that were already recommended earlier in this chat.`
  );

  const enrichedMemory = memorySections.join('\n\n');

  const enrichedUserPrefs = userPrefs
    ? {
        ...userPrefs,
        genreNames,
        languageNames,
        favoriteActors: actorNames.map((name) => ({ name })),
      }
    : null;

  return {
    enrichedMemory,
    enrichedUserPrefs,
    timezone,
  };
}
