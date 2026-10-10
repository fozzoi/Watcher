import { observable } from '@legendapp/state';
import { getSavedItems, subscribeToSavedItemsChanges, addSavedItem, removeSavedItem, hasSavedItem } from '../database';
import { logTasteEvent, TASTE_WEIGHTS } from '../services/tasteProfile';

export interface SavedState {
  savedIds: Set<number>;
  watchedIds: Set<number>;
}

export const savedStore$ = observable<SavedState>({
  savedIds: new Set<number>(),
  watchedIds: new Set<number>(),
});

export const syncSavedStore = () => {
  try {
    const m = getSavedItems('watchlist');
    const a = getSavedItems('artist');
    const newSaved = new Set<number>([...m.map((i: any) => i.id), ...a.map((i: any) => i.id)]);

    const w = getSavedItems('history');
    const newWatched = new Set<number>(w.map((i: any) => i.id));

    const currentSaved = savedStore$.savedIds.peek();
    if (!currentSaved || currentSaved.size !== newSaved.size || ![...currentSaved].every((id) => newSaved.has(id))) {
      savedStore$.savedIds.set(newSaved);
    }

    const currentWatched = savedStore$.watchedIds.peek();
    if (!currentWatched || currentWatched.size !== newWatched.size || ![...currentWatched].every((id) => newWatched.has(id))) {
      savedStore$.watchedIds.set(newWatched);
    }
  } catch (e) {
    console.error('Failed to sync savedStore:', e);
  }
};

// Automatically keep in sync with SQLite database mutations
subscribeToSavedItemsChanges(() => {
  syncSavedStore();
});

// Initial sync on startup
try {
  syncSavedStore();
} catch {}

export const toggleWatchlistGlobal = (item: any) => {
  if (!item || !item.id) return;
  const isPerson = !!(item.profile_path || item.known_for_department);
  const type = isPerson ? 'artist' : 'watchlist';
  try {
    const exists = hasSavedItem(item.id, type);
    if (exists) {
      removeSavedItem(item.id, type);
    } else {
      addSavedItem(item, type);
      if (isPerson) {
        logTasteEvent({
          entity_type: 'cast',
          entity_id: item.id,
          entity_name: item.name,
          weight: TASTE_WEIGHTS.FAVORITE_ARTIST,
        });
      } else {
        logTasteEvent({
          entity_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
          entity_id: item.id,
          entity_name: item.title || item.name,
          genres: item.genre_ids,
          weight: TASTE_WEIGHTS.WATCHLIST_ADD,
        });
      }
    }
    syncSavedStore();
  } catch (e) {
    console.error('toggleWatchlistGlobal error:', e);
  }
};
