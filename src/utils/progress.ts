import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { logTasteEvent, TASTE_WEIGHTS } from '../services/tasteProfile';

export const PROGRESS_KEY = '@watch_progress';
const LEGACY_PROGRESS_KEY = 'watch_progress_v1';

const getProgressKey = (
  tmdbId: number,
  mediaType: WatchProgress['mediaType'],
  season?: number,
  episode?: number,
  sourceKey?: string,
) => {
  const identity = `${mediaType}:${tmdbId}:${mediaType === 'tv' ? `${season || 1}:${episode || 1}` : 'movie'}`;
  return sourceKey ? `${identity}:${sourceKey}` : identity;
};

const getIdentityPrefix = (
  tmdbId: number,
  mediaType: WatchProgress['mediaType'],
  season?: number,
  episode?: number,
) => `${mediaType}:${tmdbId}:${mediaType === 'tv' ? `${season || 1}:${episode || 1}` : 'movie'}`;

let writeQueue = Promise.resolve();

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
  percentage?: number;
  completed?: boolean;
  updatedAt: number;
}

export const isEpisodeCompleted = (progress: any): boolean => {
  if (!progress) return false;
  if (progress.completed === true) return true;
  const dur = Number(progress.duration) || 0;
  const pos = Number(progress.position ?? progress.progress) || 0;
  if (dur > 0) {
    if (pos / dur >= 0.9) return true;
    if (dur - pos <= 60 && pos >= 30) return true;
  }
  const pct = Number(progress.percentage) || 0;
  if (pct >= 90) return true;
  return false;
};

// Save progress
export const saveProgress = async (progress: WatchProgress & { sourceKey?: string }) => {
  const operation = writeQueue.then(async () => {
    try {
      const stored = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
      const history = stored ? JSON.parse(stored) : {};
      const key = getProgressKey(
        progress.tmdbId,
        progress.mediaType,
        progress.lastSeason,
        progress.lastEpisode,
        progress.sourceKey,
      );
      const identity = getIdentityPrefix(
        progress.tmdbId,
        progress.mediaType,
        progress.lastSeason,
        progress.lastEpisode,
      );
      const previous = history[key] || history[identity];

      const dur = Number(progress.duration) || 0;
      const pos = Number(progress.position) || 0;
      const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : (progress.percentage || 0);
      const isCompleted = progress.completed === true || pct >= 90 || (dur > 0 && dur - pos <= 60 && pos >= 30);
      const nextProgress = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : (previous?.progress ?? 0);

      const updatedItem: WatchProgress = {
        ...previous,
        ...progress,
        position: pos,
        duration: dur,
        progress: nextProgress,
        percentage: Math.round(pct * 10) / 10,
        completed: isCompleted,
        updatedAt: progress.updatedAt || Date.now(),
      };

      history[key] = updatedItem;
      history[identity] = updatedItem;
      history[String(progress.tmdbId)] = updatedItem;

      const serialized = JSON.stringify(history);
      await AsyncStorage.setItem(PROGRESS_KEY, serialized);
      await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, serialized);

      DeviceEventEmitter.emit('watcher_watch_progress_changed', history);

      // Push progress mutation to cloud sync in background
      import('../cloudSync').then(({ queueCloudValue }) => {
        const payload: Record<string, any> = {
          [String(progress.tmdbId)]: {
            progress: pos,
            position: pos,
            duration: dur,
            percentage: Math.round(pct * 10) / 10,
            completed: isCompleted,
            season: progress.lastSeason,
            episode: progress.lastEpisode,
            lastSeason: progress.lastSeason,
            lastEpisode: progress.lastEpisode,
            tmdbId: progress.tmdbId,
            mediaType: progress.mediaType,
            title: progress.title,
            poster: progress.poster,
            updatedAt: updatedItem.updatedAt,
          },
        };
        if (progress.mediaType === 'tv') {
          payload[identity] = {
            ...updatedItem,
          };
        }
        queueCloudValue('watchProgress', payload);
      }).catch(() => {});

      // Silent taste event logging based on completion / drop thresholds
      if (nextProgress >= 0.75) {
        logTasteEvent({
          entity_type: progress.mediaType,
          entity_id: progress.tmdbId,
          entity_name: progress.title,
          weight: TASTE_WEIGHTS.COMPLETED_WATCH,
        });
      } else if (progress.position >= 60 && progress.duration > 300 && nextProgress < 0.15) {
        logTasteEvent({
          entity_type: progress.mediaType,
          entity_id: progress.tmdbId,
          entity_name: progress.title,
          weight: TASTE_WEIGHTS.DROPPED_EARLY,
        });
      }
    } catch (e) {
      console.error("Failed to save progress", e);
    }
  });
  writeQueue = operation.catch(() => undefined);
  return operation;
};

// Get progress for a specific item
export const getProgress = async (
  tmdbId: number,
  mediaType?: WatchProgress['mediaType'],
  season?: number,
  episode?: number,
  sourceKey?: string,
): Promise<WatchProgress | null> => {
  try {
    const stored = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    const history = stored ? JSON.parse(stored) : {};
    const identity = mediaType && season && episode
      ? getIdentityPrefix(tmdbId, mediaType, season, episode)
      : null;
    const progress = identity
      ? (sourceKey && history[`${identity}:${sourceKey}`]) ||
        Object.values(history)
          .filter((item: any) => item?.tmdbId === tmdbId &&
            item?.mediaType === mediaType &&
            (item?.lastSeason === season || item?.season === season) &&
            (item?.lastEpisode === episode || item?.episode === episode))
          .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] ||
        history[getProgressKey(tmdbId, mediaType!, season, episode)]
      : Object.values(history)
        .filter((item: any) => item?.tmdbId === tmdbId)
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || history[String(tmdbId)] || history[tmdbId];

    if (!progress) return null;

    const completed = isEpisodeCompleted(progress);
    const dur = Number(progress.duration) || 0;
    const pos = Number(progress.position ?? progress.progress) || 0;

    return {
      ...progress,
      lastSeason: typeof progress.lastSeason === 'number' ? progress.lastSeason : (typeof progress.season === 'number' ? progress.season : 1),
      lastEpisode: typeof progress.lastEpisode === 'number' ? progress.lastEpisode : (typeof progress.episode === 'number' ? progress.episode : 1),
      position: pos,
      duration: dur,
      progress: typeof progress.progress === 'number'
        ? progress.progress
        : dur > 0 ? pos / dur : 0,
      completed,
    };
  } catch (e) {
    return null;
  }
};

// Get all history as an array, sorted by most recent
export const getAllProgress = async (): Promise<WatchProgress[]> => {
  try {
    const stored = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    const history = stored ? JSON.parse(stored) : {};

    const map = new Map<number, WatchProgress>();
    for (const item of Object.values(history) as WatchProgress[]) {
      if (!item || !item.tmdbId) continue;
      const existing = map.get(item.tmdbId);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        map.set(item.tmdbId, {
          ...item,
          completed: isEpisodeCompleted(item),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } catch (e) {
    return [];
  }
};

// Remove a specific item from history
export const removeProgress = async (tmdbId: number) => {
  try {
    const stored = (await AsyncStorage.getItem(PROGRESS_KEY)) || (await AsyncStorage.getItem(LEGACY_PROGRESS_KEY));
    if (!stored) return;
    
    const history = JSON.parse(stored);
    Object.keys(history).forEach((key) => {
      if (history[key]?.tmdbId === tmdbId || key === String(tmdbId) || key.startsWith(`movie:${tmdbId}`) || key.startsWith(`tv:${tmdbId}`)) {
        delete history[key];
      }
    });
    
    const serialized = JSON.stringify(history);
    await AsyncStorage.setItem(PROGRESS_KEY, serialized);
    await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, serialized);

    DeviceEventEmitter.emit('watcher_watch_progress_changed', history);
  } catch (e) {
    console.error("Failed to remove progress", e);
  }
};
