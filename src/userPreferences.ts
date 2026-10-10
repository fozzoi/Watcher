import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearExploreCache } from './database';

const PREFS_KEY = 'user_preferences';
let onPreferencesChanged: ((prefs: Partial<UserPreferences>) => void) | null = null;
export const setOnPreferencesChangedListener = (listener: typeof onPreferencesChanged) => { onPreferencesChanged = listener; };

export interface FavoriteActor {
  id: number;
  name: string;
  profile_path: string | null;
}

export interface UserPreferences {
  onboardingComplete: boolean;
  country: string;            // ISO 3166-1 alpha-2, e.g. "IN"
  languages: string[];        // TMDB language codes e.g. ["hi", "ml", "ta"]
  genreIds: number[];         // TMDB genre IDs e.g. [28, 18, 878]
  favoriteActors: FavoriteActor[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  onboardingComplete: false,
  country: 'IN',
  languages: ['en'],
  genreIds: [],
  favoriteActors: [],
};

let memoryUserPreferences: UserPreferences | null = null;

export const getUserPreferencesSync = (): UserPreferences => {
  return memoryUserPreferences || DEFAULT_PREFERENCES;
};

export const getUserPreferences = async (): Promise<UserPreferences> => {
  if (memoryUserPreferences) return memoryUserPreferences;
  try {
    const str = await AsyncStorage.getItem(PREFS_KEY);
    if (!str) {
      memoryUserPreferences = DEFAULT_PREFERENCES;
      return DEFAULT_PREFERENCES;
    }
    const parsed = { ...DEFAULT_PREFERENCES, ...JSON.parse(str) };
    memoryUserPreferences = parsed;
    return parsed;
  } catch {
    memoryUserPreferences = DEFAULT_PREFERENCES;
    return DEFAULT_PREFERENCES;
  }
};

export const setUserPreferences = async (prefs: Partial<UserPreferences>, notify = true): Promise<void> => {
  const current = await getUserPreferences();
  const updated = { ...current, ...prefs };
  memoryUserPreferences = updated;
  clearExploreCache();
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  if (notify) onPreferencesChanged?.(updated);
};

export const completeOnboarding = async (prefs: Omit<UserPreferences, 'onboardingComplete'>): Promise<void> => {
  const updated = { ...prefs, onboardingComplete: true };
  memoryUserPreferences = updated;
  clearExploreCache();
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(updated));
  onPreferencesChanged?.({ ...prefs, onboardingComplete: true });
};

export const isOnboardingComplete = async (): Promise<boolean> => {
  const prefs = await getUserPreferences();
  return prefs.onboardingComplete;
};

export const resetOnboarding = async (): Promise<void> => {
  memoryUserPreferences = DEFAULT_PREFERENCES;
  clearExploreCache();
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(DEFAULT_PREFERENCES));
  onPreferencesChanged?.(DEFAULT_PREFERENCES);
};

// ── Metadata ─────────────────────────────────────────────────────────────────

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'Hollywood', flag: '🇺🇸', industry: 'English Cinema' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳', industry: 'Bollywood' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳', industry: 'Kollywood' },
  { code: 'te', label: 'Telugu', flag: '🇮🇳', industry: 'Tollywood' },
  { code: 'ml', label: 'Malayalam', flag: '🇮🇳', industry: 'Mollywood' },
  { code: 'kn', label: 'Kannada', flag: '🇮🇳', industry: 'Sandalwood' },
  { code: 'bn', label: 'Bengali', flag: '🇮🇳', industry: 'Tollywood (Bengali)' },
  { code: 'mr', label: 'Marathi', flag: '🇮🇳', industry: 'Marathi Cinema' },
  { code: 'ko', label: 'Korean', flag: '🇰🇷', industry: 'Korean Cinema' },
  { code: 'ja', label: 'Japanese', flag: '🇯🇵', industry: 'Japanese Cinema' },
  { code: 'zh', label: 'Chinese', flag: '🇨🇳', industry: 'Chinese Cinema' },
  { code: 'fr', label: 'French', flag: '🇫🇷', industry: 'French Cinema' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸', industry: 'Spanish/Latin' },
  { code: 'de', label: 'German', flag: '🇩🇪', industry: 'German Cinema' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', industry: 'Brazilian/Portuguese' },
  { code: 'it', label: 'Italian', flag: '🇮🇹', industry: 'Italian Cinema' },
  { code: 'tr', label: 'Turkish', flag: '🇹🇷', industry: 'Turkish Cinema' },
  { code: 'ar', label: 'Arabic', flag: '🇸🇦', industry: 'Arab Cinema' },
  { code: 'th', label: 'Thai', flag: '🇹🇭', industry: 'Thai Cinema' },
];

export const GENRE_OPTIONS = [
  { id: 28,    label: 'Action',       emoji: '💥' },
  { id: 12,    label: 'Adventure',    emoji: '🗺️' },
  { id: 16,    label: 'Animation',    emoji: '🎨' },
  { id: 35,    label: 'Comedy',       emoji: '😂' },
  { id: 80,    label: 'Crime',        emoji: '🔍' },
  { id: 99,    label: 'Documentary',  emoji: '🎙️' },
  { id: 18,    label: 'Drama',        emoji: '🎭' },
  { id: 10751, label: 'Family',       emoji: '👨‍👩‍👧' },
  { id: 14,    label: 'Fantasy',      emoji: '🧙' },
  { id: 27,    label: 'Horror',       emoji: '👻' },
  { id: 9648,  label: 'Mystery',      emoji: '🕵️' },
  { id: 10749, label: 'Romance',      emoji: '❤️' },
  { id: 878,   label: 'Sci-Fi',       emoji: '🚀' },
  { id: 53,    label: 'Thriller',     emoji: '🔪' },
  { id: 10752, label: 'War',          emoji: '⚔️' },
  { id: 37,    label: 'Western',      emoji: '🤠' },
];
