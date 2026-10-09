import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Open the database synchronously
const db = SQLite.openDatabaseSync('watcher.db');

export type SavedItemType = 'watchlist' | 'history' | 'artist';
const savedItemsUiListeners = new Set<(type: SavedItemType) => void>();
let cloudOnlyMode = false;
const cloudItems: Record<SavedItemType, any[]> = { watchlist: [], history: [], artist: [] };

const itemRowId = (item: any, type: SavedItemType) => {
  const id = String(item?.id ?? item?.media_id ?? '');
  if (type === 'artist') return `${type}_${id}`;
  return `${type}_${item?.media_type === 'tv' ? 'tv' : 'movie'}_${id}`;
};

export const subscribeToSavedItemsChanges = (listener: (type: SavedItemType) => void) => {
  savedItemsUiListeners.add(listener);
  return () => { savedItemsUiListeners.delete(listener); };
};

const notifySavedItemsUiListeners = (type: SavedItemType) => {
  for (const listener of savedItemsUiListeners) {
    try { listener(type); } catch (error) { console.warn('Saved item UI refresh listener failed:', error); }
  }
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

      CREATE TABLE IF NOT EXISTS user_taste_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_name TEXT,
        genres TEXT,
        keywords TEXT,
        weight REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_taste_timestamp ON user_taste_events(timestamp);

      CREATE TABLE IF NOT EXISTS for_you_cache (
        shelf_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        items_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_foryou_sort ON for_you_cache(sort_order);
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
      notifySavedItemsUiListeners('watchlist');
      notifySavedItemsUiListeners('history');
      notifySavedItemsUiListeners('artist');
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
  notifySavedItemsUiListeners(mutation.type);
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

// ==========================================
// USER TASTE EVENTS & FOR-YOU SHELF CACHE
// ==========================================

export interface TasteEventRecord {
  id?: number;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
  genres?: string | null;
  keywords?: string | null;
  weight: number;
  timestamp: number;
}

export interface ForYouShelfRecord {
  shelf_id: string;
  title: string;
  subtitle?: string | null;
  items_json: string;
  sort_order: number;
  updated_at: number;
}

export const insertTasteEvent = (event: Omit<TasteEventRecord, 'id'>) => {
  try {
    db.runSync(
      'INSERT INTO user_taste_events (entity_type, entity_id, entity_name, genres, keywords, weight, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        event.entity_type,
        String(event.entity_id),
        event.entity_name || null,
        event.genres || null,
        event.keywords || null,
        event.weight,
        event.timestamp || Date.now(),
      ]
    );
  } catch (error) {
    console.warn('Failed to insert taste event:', error);
  }
};

export const getRecentTasteEvents = (limit: number = 300, sinceTimestamp?: number): TasteEventRecord[] => {
  try {
    const minTimestamp = sinceTimestamp ?? (Date.now() - 60 * 86400000); // Default to last 60 days
    const rows = db.getAllSync<TasteEventRecord>(
      'SELECT id, entity_type, entity_id, entity_name, genres, keywords, weight, timestamp FROM user_taste_events WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT ?',
      [minTimestamp, limit]
    );
    return rows;
  } catch (error) {
    console.warn('Failed to get recent taste events:', error);
    return [];
  }
};

export const restoreTasteEvents = (events: TasteEventRecord[]) => {
  if (!Array.isArray(events) || events.length === 0) return;
  try {
    const existing = db.getAllSync<{ entity_type: string; entity_id: string; timestamp: number }>(
      'SELECT entity_type, entity_id, timestamp FROM user_taste_events ORDER BY timestamp DESC LIMIT 1000'
    );
    const existingKeys = new Set(existing.map((e) => `${e.entity_type}:${e.entity_id}:${e.timestamp}`));

    db.withTransactionSync(() => {
      const stmt = db.prepareSync(
        'INSERT INTO user_taste_events (entity_type, entity_id, entity_name, genres, keywords, weight, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );
      for (const ev of events) {
        if (!ev || !ev.entity_type || !ev.entity_id) continue;
        const key = `${ev.entity_type}:${ev.entity_id}:${ev.timestamp}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);

        stmt.executeSync([
          ev.entity_type,
          String(ev.entity_id),
          ev.entity_name || null,
          ev.genres || null,
          ev.keywords || null,
          Number(ev.weight) || 1.0,
          Number(ev.timestamp) || Date.now(),
        ]);
      }
      stmt.finalizeSync();
    });
  } catch (error) {
    console.warn('Failed to restore taste events:', error);
  }
};

export const pruneOldTasteEvents = (maxAgeDays: number = 60) => {
  try {
    const threshold = Date.now() - (maxAgeDays * 86400000);
    db.runSync('DELETE FROM user_taste_events WHERE timestamp < ?', [threshold]);
  } catch (error) {
    console.warn('Failed to prune old taste events:', error);
  }
};

export const saveForYouShelves = (
  shelves: { shelf_id?: string; shelfId?: string; title: string; subtitle?: string | null; items: any[]; sort_order?: number; sortOrder?: number }[]
) => {
  try {
    const now = Date.now();
    db.withTransactionSync(() => {
      db.runSync('DELETE FROM for_you_cache');
      const stmt = db.prepareSync(
        'INSERT OR REPLACE INTO for_you_cache (shelf_id, title, subtitle, items_json, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      );
      shelves.forEach((s, idx) => {
        const id = s.shelfId || s.shelf_id || `shelf-${idx}`;
        const order = s.sortOrder ?? s.sort_order ?? idx;
        stmt.executeSync([
          id,
          s.title,
          s.subtitle || null,
          JSON.stringify(s.items || []),
          order,
          now,
        ]);
      });
      stmt.finalizeSync();
    });
  } catch (error) {
    console.error('Failed to save for_you_cache:', error);
  }
};

export const getForYouCachedShelves = (): {
  shelfId: string;
  title: string;
  subtitle?: string | null;
  items: any[];
  sortOrder: number;
  updatedAt: number;
}[] => {
  try {
    const rows = db.getAllSync<ForYouShelfRecord>(
      'SELECT shelf_id, title, subtitle, items_json, sort_order, updated_at FROM for_you_cache ORDER BY sort_order ASC'
    );
    return rows.map((r) => ({
      shelfId: r.shelf_id,
      title: r.title,
      subtitle: r.subtitle,
      items: JSON.parse(r.items_json || '[]'),
      sortOrder: r.sort_order,
      updatedAt: r.updated_at,
    }));
  } catch (error) {
    console.error('Failed to get for_you_cache:', error);
    return [];
  }
};

export const getForYouCacheLastUpdated = (): number => {
  try {
    const row = db.getFirstSync<{ max_time: number | null }>(
      'SELECT MAX(updated_at) AS max_time FROM for_you_cache'
    );
    return row?.max_time || 0;
  } catch {
    return 0;
  }
};

export const clearForYouCache = () => {
  try {
    db.runSync('DELETE FROM for_you_cache');
  } catch (error) {
    console.error('Failed to clear for_you_cache:', error);
  }
};
