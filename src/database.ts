import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Open the database synchronously
const db = SQLite.openDatabaseSync('watcher.db');

export type SavedItemType = 'watchlist' | 'history' | 'artist';

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
  }
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
                const rowId = `${type}_${mediaId}`;
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
  try {
    // We order by created_at DESC (newest first)
    const result = db.getAllSync<{ data: string }>('SELECT data FROM saved_items WHERE type = ? ORDER BY created_at DESC', [type]);
    return result.map(row => JSON.parse(row.data));
  } catch (error) {
    console.error(`Failed to get ${type}:`, error);
    return [];
  }
};

/**
 * Check if a specific item exists in a specific list.
 */
export const hasSavedItem = (mediaId: number, type: SavedItemType): boolean => {
  try {
    const rowId = `${type}_${mediaId}`;
    const result = db.getFirstSync<{ id: string }>('SELECT id FROM saved_items WHERE id = ?', [rowId]);
    return !!result;
  } catch (error) {
    return false;
  }
};

let onWatchlistChangedCallback: (() => void) | null = null;

export const setOnWatchlistChangedListener = (callback: (() => void) | null) => {
  onWatchlistChangedCallback = callback;
};

const notifyWatchlistChanged = (type: SavedItemType) => {
  if (type === 'watchlist' && onWatchlistChangedCallback) {
    try {
      onWatchlistChangedCallback();
    } catch (e) {
      console.error('Error in onWatchlistChangedCallback:', e);
    }
  }
};

/**
 * Add or update an item in a specific list.
 */
export const addSavedItem = (item: any, type: SavedItemType) => {
  if (!item || item.id === undefined) return;
  try {
    const rowId = `${type}_${item.id}`;
    db.runSync(
      'INSERT OR REPLACE INTO saved_items (id, media_id, type, data, created_at) VALUES (?, ?, ?, ?, ?)',
      [rowId, item.id, type, JSON.stringify(item), Date.now()]
    );
    notifyWatchlistChanged(type);
  } catch (error) {
    console.error(`Failed to add item to ${type}:`, error);
  }
};

/**
 * Remove an item from a specific list.
 */
export const removeSavedItem = (mediaId: number, type: SavedItemType) => {
  try {
    const rowId = `${type}_${mediaId}`;
    db.runSync('DELETE FROM saved_items WHERE id = ?', [rowId]);
    notifyWatchlistChanged(type);
  } catch (error) {
    console.error(`Failed to remove item from ${type}:`, error);
  }
};

/**
 * Clear an entire list.
 */
export const clearSavedItems = (type: SavedItemType) => {
  try {
    db.runSync('DELETE FROM saved_items WHERE type = ?', [type]);
    notifyWatchlistChanged(type);
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
