import AsyncStorage from '@react-native-async-storage/async-storage';

const PROGRESS_KEY = '@watch_progress';

const getProgressKey = (
  tmdbId: number,
  mediaType: WatchProgress['mediaType'],
  season?: number,
  episode?: number,
) => `${mediaType}:${tmdbId}:${mediaType === 'tv' ? `${season || 1}:${episode || 1}` : 'movie'}`;

export interface WatchProgress {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;       
  poster: string;      
  lastSeason: number;
  lastEpisode: number; 
  position: number; 
  duration: number; 
  progress?: number;
  updatedAt: number;
}

// Save progress
export const saveProgress = async (progress: WatchProgress) => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    const history = stored ? JSON.parse(stored) : {};
    
    const previous = history[progress.tmdbId];
    const nextProgress = progress.duration > 0
      ? Math.max(0, Math.min(1, progress.position / progress.duration))
      : previous?.progress ?? 0;
    history[getProgressKey(progress.tmdbId, progress.mediaType, progress.lastSeason, progress.lastEpisode)] = {
      ...previous,
      ...progress,
      progress: nextProgress,
    };
    
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save progress", e);
  }
};

// Get progress for a specific item
export const getProgress = async (
  tmdbId: number,
  mediaType?: WatchProgress['mediaType'],
  season?: number,
  episode?: number,
): Promise<WatchProgress | null> => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    const history = stored ? JSON.parse(stored) : {};
    const progress = mediaType && season && episode
      ? history[getProgressKey(tmdbId, mediaType, season, episode)]
      : Object.values(history)
        .filter((item: any) => item?.tmdbId === tmdbId)
        .sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0] || history[tmdbId];
    return progress ? {
      ...progress,
      progress: typeof progress.progress === 'number'
        ? progress.progress
        : progress.duration > 0 ? progress.position / progress.duration : 0,
    } : null;
  } catch (e) {
    return null;
  }
};

// Get all history as an array, sorted by most recent
export const getAllProgress = async (): Promise<WatchProgress[]> => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    const history = stored ? JSON.parse(stored) : {};
    return Object.values(history).sort((a: any, b: any) => b.updatedAt - a.updatedAt) as WatchProgress[];
  } catch (e) {
    return [];
  }
};

// Remove a specific item from history
export const removeProgress = async (tmdbId: number) => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    if (!stored) return;
    
    const history = JSON.parse(stored);
    Object.keys(history).forEach((key) => {
      if (history[key]?.tmdbId === tmdbId || key === String(tmdbId)) delete history[key];
    });
    
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to remove progress", e);
  }
};