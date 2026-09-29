import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Open the database synchronously
const db = SQLite.openDatabaseSync('watcher.db');

export type SavedItemType = 'watchlist' | 'history' | 'artist';
let cloudOnlyMode = false;
const cloudItems: Record<SavedItemType, any[]> = { watchlist: [], history: [], artist: [] };

const itemRowId = (item: any, type: SavedItemType) => {
  const id = String(item?.id ?? item?.media_id ?? '');
  if (type === 'artist') return `${type}_${id}`;
  return `${type}_${item?.media_type === 'tv' ? 'tv' : 'movie'}_${id}`;
};

export const initDb = () => {
  try {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS saved_items (
        id TEXT PRIMARY KEY,
        media_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_type ON saved_items(type);

      CREATE TABLE IF NOT EXISTS ai_embeddings (
        media_id INTEGER PRIMARY KEY,
        embedding TEXT NOT NULL
      );
    `);
  } catch (error) {
    console.error('Failed to initialize SQLite database:', error);
    throw error;
  }
};

/** Keep signed-in library data in memory; SQLite remains the signed-out store. */
export const setCloudOnlyMode = (enabled: boolean, library?: any) => {
  if (enabled) {
    cloudOnlyMode = true;
    if (library) {
      cloudItems.watchlist = Array.isArray(library.watchlist) ? [...library.watchlist] : [];
      cloudItems.history = Array.isArray(library.history) ? [...library.history] : [];
      cloudItems.artist = Array.isArray(library.favoriteArtists) ? [...library.favoriteArtists] : [];
    }
    try { db.runSync('DELETE FROM saved_items'); } catch (error) { console.warn('Could not clear signed-in SQLite cache:', error); }
    return;
  }
  if (!cloudOnlyMode) return;
  cloudOnlyMode = false;
  try {
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM saved_items');
      const stmt = db.prepareSync('INSERT OR REPLACE INTO saved_items (id, media_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)');
      for (const type of ['watchlist', 'history', 'artist'] as const) {
        cloudItems[type].forEach((item, index) => {
          const mediaId = Number(item?.id ?? item?.media_id);
          if (Number.isFinite(mediaId)) stmt.executeSync([itemRowId(item, type), mediaId, type, JSON.stringify(item), Date.now() + index]);
        });
      }
      stmt.finalizeSync();
    });
  } catch (error) { console.error('Could not restore the signed-out library:', error); }
  cloudItems.watchlist = [];
  cloudItems.history = [];
  cloudItems.artist = [];
};

/**
 * Migrate old AsyncStorage lists to SQLite safely.
 * Only runs once on app startup.
 */
export const performMigration = async () => {
  try {
    const isMigrated = await AsyncStorage.getItem('sqlite_migrated_v1');
    if (isMigrated === 'true') return;

    console.log('Starting SQLite migration from AsyncStorage...');

    const keys: { key: string; type: SavedItemType }[] = [
      { key: 'watchlist', type: 'watchlist' },
      { key: 'history', type: 'history' },
      { key: 'favoriteArtists', type: 'artist' },
    ];

    let totalMigrated = 0;

    for (const { key, type } of keys) {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const items = JSON.parse(stored);
        if (Array.isArray(items)) {
          // Wrap in a transaction for speed
          db.withTransactionSync(() => {
            const stmt = db.prepareSync('INSERT OR REPLACE INTO saved_items (id, media_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)');
            items.forEach((item, index) => {
              // Ensure we have an ID
              const mediaId = item.id;
              if (mediaId !== undefined) {
                const rowId = itemRowId(item, type);
                // Keep original sorting by using Date.now() + index (so older items have lower timestamps if list was chronological)
                // Actually AsyncStorage is stored in order of addition usually.
                // Reversing index to simulate older items first
                const timestamp = Date.now() - ((items.length - index) * 1000);
                stmt.executeSync([rowId, mediaId, type, JSON.stringify(item), timestamp]);
                totalMigrated++;
              }
            });
            stmt.finalizeSync();
          });
        }
      }
    }

    console.log(`Migration complete! Successfully migrated ${totalMigrated} items to SQLite.`);
    
    // Mark as migrated so we never run this again
    await AsyncStorage.setItem('sqlite_migrated_v1', 'true');
  } catch (error) {
    console.error('SQLite Migration failed:', error);
  }
};

/**
 * Get all items of a specific type.
 * Returns an array of parsed objects.
 */
export const getSavedItems = (type: SavedItemType): any[] => {
  if (cloudOnlyMode) return [...cloudItems[type]];
  try {
    // We order by created_at DESC (newest first)
    const result = db.getAllSync<{ data: string }>('SELECT data FROM saved_items WHERE type = ? ORDER BY created_at DESC', [type]);
    const seen = new Set<string>();
    return result.map(row => JSON.parse(row.data)).filter(item => {
      const key = itemRowId(item, type);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (error) {
    console.error(`Failed to get ${type}:`, error);
    return [];
  }
};

/**
 * Check if a specific item exists in a specific list.
 */
export const hasSavedItem = (mediaId: number, type: SavedItemType): boolean => {
  if (cloudOnlyMode) return cloudItems[type].some(item => Number(item?.id ?? item?.media_id) === Number(mediaId));
  try {
    const result = db.getAllSync<{ data: string }>('SELECT data FROM saved_items WHERE type = ? AND media_id = ?', [type, mediaId]);
    return result.length > 0;
  } catch (error) {
    return false;
  }
};

export type SavedItemsMutation = { type: SavedItemType; action: 'add' | 'remove' | 'clear'; item?: any; mediaId?: number; mediaType?: 'movie' | 'tv' };
let onSavedItemsChangedCallback: ((mutation: SavedItemsMutation) => void) | null = null;

export const setOnSavedItemsChangedListener = (callback: ((mutation: SavedItemsMutation) => void) | null) => {
  onSavedItemsChangedCallback = callback;
};

// Kept for callers using the old name. Library changes now include history and artists.
export const setOnWatchlistChangedListener = setOnSavedItemsChangedListener;

const notifySavedItemsChanged = (mutation: SavedItemsMutation) => {
  if (onSavedItemsChangedCallback) {
    try {
      onSavedItemsChangedCallback(mutation);
    } catch (e) {
      console.error('Error in onSavedItemsChangedCallback:', e);
    }
  }
};

/**
 * Add or update an item in a specific list.
 */
export const addSavedItem = (item: any, type: SavedItemType) => {
  if (!item || item.id === undefined) return;
  if (cloudOnlyMode) {
    const rowId = itemRowId(item, type);
    cloudItems[type] = [item, ...cloudItems[type].filter(existing => itemRowId(existing, type) !== rowId)];
    notifySavedItemsChanged({ type, action: 'add', item });
    return;
  }
  try {
    const rowId = itemRowId(item, type);
    db.runSync(
      'INSERT OR REPLACE INTO saved_items (id, media_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)',
      [rowId, item.id, type, JSON.stringify(item), Date.now()]
    );
    notifySavedItemsChanged({ type, action: 'add', item });
  } catch (error) {
    console.error(`Failed to add item to ${type}:`, error);
  }
};

/**
 * Remove an item from a specific list.
 */
export const removeSavedItem = (mediaId: number, type: SavedItemType, mediaType?: 'movie' | 'tv') => {
  if (cloudOnlyMode) {
    const removed = cloudItems[type].filter(item => Number(item?.id ?? item?.media_id) === Number(mediaId) && (!mediaType || (item?.media_type === 'tv' ? 'tv' : 'movie') === mediaType));
    cloudItems[type] = cloudItems[type].filter(item => !removed.includes(item));
    notifySavedItemsChanged({ type, action: 'remove', mediaId, mediaType: mediaType || (removed[0]?.media_type === 'tv' ? 'tv' : 'movie') });
    return;
  }
  try {
    const existing = db.getAllSync<{ id: string; data: string }>('SELECT id, data FROM saved_items WHERE type = ? AND media_id = ?', [type, mediaId]);
    const removed = existing.filter(row => {
      if (type === 'artist' || !mediaType) return true;
      const item = JSON.parse(row.data);
      return (item?.media_type === 'tv' ? 'tv' : 'movie') === mediaType;
    });
    if (!mediaType && type !== 'artist' && removed[0]) mediaType = JSON.parse(removed[0].data)?.media_type === 'tv' ? 'tv' : 'movie';
    for (const row of removed) db.runSync('DELETE FROM saved_items WHERE id = ?', [row.id]);
    notifySavedItemsChanged({ type, action: 'remove', mediaId, mediaType });
  } catch (error) {
    console.error(`Failed to remove item from ${type}:`, error);
  }
};

/**
 * Clear an entire list.
 */
export const clearSavedItems = (type: SavedItemType, notify = true) => {
  if (cloudOnlyMode) {
    cloudItems[type] = [];
    if (notify) notifySavedItemsChanged({ type, action: 'clear' });
    return;
  }
  try {
    db.runSync('DELETE FROM saved_items WHERE type = ?', [type]);
    if (notify) notifySavedItemsChanged({ type, action: 'clear' });
  } catch (error) {
    console.error(`Failed to clear ${type}:`, error);
  }
};

/**
 * Save an AI embedding for a media item.
 */
export const saveAiEmbedding = (mediaId: number, embeddingArray: number[]) => {
  try {
    const stmt = db.prepareSync('INSERT OR REPLACE INTO ai_embeddings (media_id, embedding) VALUES (?, ?)');
    stmt.executeSync([mediaId, JSON.stringify(embeddingArray)]);
    stmt.finalizeSync();
  } catch (error) {
    console.error('Failed to save AI embedding:', error);
  }
};

/**
 * Get all AI embeddings.
 * Returns an array of objects { media_id: number, embedding: number[] }.
 */
export const getAllAiEmbeddings = (): { media_id: number, embedding: number[] }[] => {
  try {
    const result = db.getAllSync<{ media_id: number, embedding: string }>('SELECT media_id, embedding FROM ai_embeddings');
    return result.map(row => ({
      media_id: row.media_id,
      embedding: JSON.parse(row.embedding)
    }));
  } catch (error) {
    console.error('Failed to get AI embeddings:', error);
    return [];
  }
};

export const getAiEmbedding = (mediaId: number): number[] | null => {
  try {
    const result = db.getFirstSync<{ embedding: string }>('SELECT embedding FROM ai_embeddings WHERE media_id = ?', [mediaId]);
    return result ? JSON.parse(result.embedding) : null;
  } catch (error) {
    return null;
  }
};

export const insertAiEmbedding = saveAiEmbedding;
