import AsyncStorage from '@react-native-async-storage/async-storage';

const PROGRESS_KEY = '@watch_progress';

export interface WatchProgress {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;       
  poster: string;      
  lastSeason: number;
  lastEpisode: number; 
  position: number; 
  duration: number; 
  updatedAt: number;
}

// Save progress
export const saveProgress = async (progress: WatchProgress) => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    const history = stored ? JSON.parse(stored) : {};
    
    history[progress.tmdbId] = progress;
    
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save progress", e);
  }
};

// Get progress for a specific item
export const getProgress = async (tmdbId: number) => {
  try {
    const stored = await AsyncStorage.getItem(PROGRESS_KEY);
    const history = stored ? JSON.parse(stored) : {};
    return history[tmdbId] || null;
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
    delete history[tmdbId];
    
    await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to remove progress", e);
  }
};