import { observable, opaqueObject } from '@legendapp/state';
import { getSavedItems, subscribeToSavedItemsChanges, addSavedItem, removeSavedItem, hasSavedItem } from '../database';
import { logTasteEvent, TASTE_WEIGHTS } from '../services/tasteProfile';
import { snackbarService } from '../services/snackbar';

export interface SavedState {
  savedIds: Set<number>;
  watchedIds: Set<number>;
}

export const savedStore$ = observable<SavedState>({
  savedIds: opaqueObject(new Set<number>()),
  watchedIds: opaqueObject(new Set<number>()),
});

export const syncSavedStore = () => {
  try {
    const m = getSavedItems('watchlist') || [];
    const a = getSavedItems('artist') || [];
    const newSaved = new Set<number>(
      [...m.map((i: any) => Number(i.id ?? i.media_id)), ...a.map((i: any) => Number(i.id ?? i.media_id))]
        .filter((n) => !isNaN(n) && n > 0)
    );

    const w = getSavedItems('history') || [];
    const newWatched = new Set<number>(
      w.map((i: any) => Number(i.id ?? i.media_id)).filter((n) => !isNaN(n) && n > 0)
    );

    const currentSaved = savedStore$.savedIds.peek();
    if (!currentSaved || currentSaved.size !== newSaved.size || ![...currentSaved].every((id) => newSaved.has(id))) {
      savedStore$.savedIds.set(opaqueObject(newSaved));
    }

    const currentWatched = savedStore$.watchedIds.peek();
    if (!currentWatched || currentWatched.size !== newWatched.size || ![...currentWatched].every((id) => newWatched.has(id))) {
      savedStore$.watchedIds.set(opaqueObject(newWatched));
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

export const toggleWatchlistGlobal = (
  item: any,
  options?: { skipSnackbar?: boolean }
) => {
  if (!item) return;
  const rawId = item.id ?? item.media_id;
  if (rawId === undefined || rawId === null) return;
  const numId = Number(rawId);
  if (isNaN(numId) || numId <= 0) return;

  const isPerson = !!(item.profile_path || item.known_for_department);
  const type = isPerson ? 'artist' : 'watchlist';
  try {
    const exists = hasSavedItem(numId, type);
    if (exists) {
      removeSavedItem(numId, type);
    } else {
      addSavedItem(item, type);
      if (isPerson) {
        logTasteEvent({
          entity_type: 'cast',
          entity_id: numId,
          entity_name: item.name,
          weight: TASTE_WEIGHTS.FAVORITE_ARTIST,
        });
      } else {
        logTasteEvent({
          entity_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
          entity_id: numId,
          entity_name: item.title || item.name,
          genres: item.genres || item.genre_ids,
          weight: TASTE_WEIGHTS.WATCHLIST_ADD,
        });
      }
    }
    syncSavedStore();

    if (!options?.skipSnackbar) {
      const title = item.title || item.name || (isPerson ? 'Artist' : 'Item');
      const targetName = isPerson ? 'Favorite Artists' : 'Watchlist';
      const actionText = exists ? 'Removed from' : 'Added to';
      const message = `${actionText} ${targetName}: ${title}`;

      snackbarService.show({
        message,
        actionLabel: 'Undo',
        duration: 'short',
        onAction: () => {
          toggleWatchlistGlobal(item, { skipSnackbar: true });
        },
      });
    }
  } catch (e) {
    console.error('toggleWatchlistGlobal error:', e);
  }
};
