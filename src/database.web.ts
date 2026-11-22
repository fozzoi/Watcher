import AsyncStorage from '@react-native-async-storage/async-storage';

export type SavedItemType = 'watchlist' | 'history' | 'artist';
const savedItemsUiListeners = new Set<(type: SavedItemType) => void>();
let cloudOnlyMode = false;
const cloudItems: Record<SavedItemType, any[]> = { watchlist: [], history: [], artist: [] };

const memoryStorage = new Map<string, string>();

const getStorageItem = (key: string): string | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {}
  return memoryStorage.get(key) ?? null;
};

const setStorageItem = (key: string, value: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {}
  memoryStorage.set(key, value);
};

const removeStorageItem = (key: string): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {}
  memoryStorage.delete(key);
};

const normalizeMediaType = (item: any): 'movie' | 'tv' | 'collection' => {
  if (item?.media_type === 'tv') return 'tv';
  if (item?.media_type === 'collection') return 'collection';
  if (item?.media_type === 'movie') return 'movie';
  return item?.first_air_date && !item?.release_date ? 'tv' : 'movie';
};

const itemRowId = (item: any, type: SavedItemType) => {
  const id = String(item?.id ?? item?.media_id ?? '');
  if (type === 'artist') return `${type}_${id}`;
  return `${type}_${normalizeMediaType(item)}_${id}`;
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
  // Web storage is initialized via localStorage
};

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
      removeStorageItem('watcher_saved_items');
    }
    return;
  }
  if (!cloudOnlyMode) return;
  cloudOnlyMode = false;
  try {
    const raw: Record<string, any> = {};
    for (const type of ['watchlist', 'history', 'artist'] as const) {
      cloudItems[type].forEach((item) => {
        raw[itemRowId(item, type)] = item;
      });
    }
    setStorageItem('watcher_saved_items', JSON.stringify(raw));
  } catch (error) {
    console.error('Could not restore the signed-out library on web:', error);
  }
  cloudItems.watchlist = [];
  cloudItems.history = [];
  cloudItems.artist = [];
  notifySavedItemsUiListeners('watchlist');
  notifySavedItemsUiListeners('history');
  notifySavedItemsUiListeners('artist');
};

export const performMigration = async () => {
  // Web handles storage directly via localStorage
};

const getRawSavedItemsMap = (): Record<string, any> => {
  try {
    const raw = getStorageItem('watcher_saved_items');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveRawSavedItemsMap = (map: Record<string, any>) => {
  try {
    setStorageItem('watcher_saved_items', JSON.stringify(map));
  } catch (e) {
    console.error('Failed to save items to web storage:', e);
  }
};

export const getSavedItems = (type: SavedItemType): any[] => {
  if (cloudOnlyMode) return [...cloudItems[type]];
  try {
    const map = getRawSavedItemsMap();
    const items = Object.entries(map)
      .filter(([key]) => key.startsWith(`${type}_`))
      .map(([, val]) => val);
    return items.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  } catch (error) {
    console.error(`Failed to get ${type}:`, error);
    return [];
  }
};

export const hasSavedItem = (mediaId: number, type: SavedItemType): boolean => {
  if (cloudOnlyMode) return cloudItems[type].some(item => Number(item?.id ?? item?.media_id) === Number(mediaId));
  try {
    const items = getSavedItems(type);
    return items.some(item => Number(item?.id ?? item?.media_id) === Number(mediaId));
  } catch (error) {
    return false;
  }
};

export type SavedItemsMutation = { type: SavedItemType; action: 'add' | 'remove' | 'clear'; item?: any; mediaId?: number; mediaType?: 'movie' | 'tv' | 'collection' };
let onSavedItemsChangedCallback: ((mutation: SavedItemsMutation) => void) | null = null;
const savedItemsChangeListeners = new Set<(mutation: SavedItemsMutation) => void>();

export const addSavedItemsChangeListener = (callback: (mutation: SavedItemsMutation) => void) => {
  savedItemsChangeListeners.add(callback);
  return () => { savedItemsChangeListeners.delete(callback); };
};

export const setOnSavedItemsChangedListener = (callback: ((mutation: SavedItemsMutation) => void) | null) => {
  onSavedItemsChangedCallback = callback;
};

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
  for (const listener of savedItemsChangeListeners) {
    try {
      listener(mutation);
    } catch (e) {
      console.error('Error in saved items change listener:', e);
    }
  }
};

export const addSavedItem = (item: any, type: SavedItemType) => {
  if (!item || item.id === undefined) return;
  const now = Date.now();
  const stampedItem = {
    ...item,
    id: Number(item.id),
    added_at: item.added_at || item.created_at || now,
    created_at: item.created_at || item.added_at || now,
  };
  if (cloudOnlyMode) {
    const rowId = itemRowId(stampedItem, type);
    cloudItems[type] = [stampedItem, ...cloudItems[type].filter(existing => itemRowId(existing, type) !== rowId)];
    notifySavedItemsChanged({ type, action: 'add', item: stampedItem });
    return;
  }
  try {
    const map = getRawSavedItemsMap();
    const rowId = itemRowId(stampedItem, type);
    map[rowId] = stampedItem;
    saveRawSavedItemsMap(map);
    notifySavedItemsChanged({ type, action: 'add', item: stampedItem });
  } catch (error) {
    console.error(`Failed to add item to ${type}:`, error);
  }
};

export const removeSavedItem = (mediaId: number, type: SavedItemType, mediaType?: 'movie' | 'tv' | 'collection') => {
  if (cloudOnlyMode) {
    const removed = cloudItems[type].filter(item =>
      Number(item?.id ?? item?.media_id) === Number(mediaId) &&
      (type === 'artist' || !mediaType || normalizeMediaType(item) === mediaType)
    );
    cloudItems[type] = cloudItems[type].filter(item => !removed.includes(item));
    const resolvedMediaType = type === 'artist' ? undefined : (mediaType || (removed[0] ? normalizeMediaType(removed[0]) : undefined));
    notifySavedItemsChanged({ type, action: 'remove', mediaId, mediaType: resolvedMediaType });
    return;
  }
  try {
    const map = getRawSavedItemsMap();
    let resolvedMediaType = mediaType;
    for (const [key, val] of Object.entries(map)) {
      if (key.startsWith(`${type}_`) && Number(val?.id ?? val?.media_id) === Number(mediaId)) {
        if (!resolvedMediaType && type !== 'artist') resolvedMediaType = normalizeMediaType(val);
        if (type === 'artist' || !mediaType || normalizeMediaType(val) === mediaType) {
          delete map[key];
        }
      }
    }
    saveRawSavedItemsMap(map);
    notifySavedItemsChanged({ type, action: 'remove', mediaId, mediaType: type === 'artist' ? undefined : resolvedMediaType });
  } catch (error) {
    console.error(`Failed to remove item from ${type}:`, error);
  }
};

export const clearSavedItems = (type: SavedItemType, notify = true) => {
  if (cloudOnlyMode) {
    cloudItems[type] = [];
    if (notify) notifySavedItemsChanged({ type, action: 'clear' });
    return;
  }
  try {
    const map = getRawSavedItemsMap();
    for (const key of Object.keys(map)) {
      if (key.startsWith(`${type}_`)) {
        delete map[key];
      }
    }
    saveRawSavedItemsMap(map);
    if (notify) notifySavedItemsChanged({ type, action: 'clear' });
  } catch (error) {
    console.error(`Failed to clear ${type}:`, error);
  }
};

export const batchRestoreSavedItems = (itemsByType: {
  watchlist?: any[];
  artist?: any[];
  history?: any[];
}): { restoredCount: number } => {
  let restoredCount = 0;
  const now = Date.now();
  const types: SavedItemType[] = ['watchlist', 'artist', 'history'];

  const processed: Record<SavedItemType, any[]> = {
    watchlist: [],
    artist: [],
    history: [],
  };

  for (const type of types) {
    const list = itemsByType[type];
    if (Array.isArray(list)) {
      for (const raw of list) {
        if (!raw || raw.id === undefined) continue;
        const stamped = {
          ...raw,
          id: Number(raw.id),
          added_at: raw.added_at || raw.created_at || now,
          created_at: raw.created_at || raw.added_at || now,
        };
        processed[type].push(stamped);
        restoredCount++;
      }
    }
  }

  if (cloudOnlyMode) {
    for (const type of types) {
      if (processed[type].length > 0) {
        const existingMap = new Map<string, any>();
        for (const item of cloudItems[type]) {
          existingMap.set(itemRowId(item, type), item);
        }
        for (const item of processed[type]) {
          existingMap.set(itemRowId(item, type), item);
        }
        cloudItems[type] = Array.from(existingMap.values());
      }
    }
  }

  try {
    const map = getRawSavedItemsMap();
    for (const type of types) {
      for (const item of processed[type]) {
        map[itemRowId(item, type)] = item;
      }
    }
    saveRawSavedItemsMap(map);
  } catch (error) {
    console.error('Failed to batch restore saved items on web:', error);
  }

  for (const type of types) {
    if (processed[type].length > 0) {
      notifySavedItemsUiListeners(type);
    }
  }

  return { restoredCount };
};

// ==========================================
// AI EMBEDDINGS (WEB IN-MEMORY / STORAGE)
// ==========================================

const aiEmbeddingsMap = new Map<number, number[]>();

export const saveAiEmbedding = (mediaId: number, embeddingArray: number[]) => {
  aiEmbeddingsMap.set(Number(mediaId), embeddingArray);
};

export const getAllAiEmbeddings = (): { media_id: number, embedding: number[] }[] => {
  const result: { media_id: number; embedding: number[] }[] = [];
  for (const [media_id, embedding] of aiEmbeddingsMap.entries()) {
    result.push({ media_id, embedding });
  }
  return result;
};

export const getAiEmbedding = (mediaId: number): number[] | null => {
  return aiEmbeddingsMap.get(Number(mediaId)) ?? null;
};

export const insertAiEmbedding = saveAiEmbedding;

export const pruneAiEmbeddings = (validMediaIds: number[]): number => {
  const valid = new Set(validMediaIds.map(id => Number(id)));
  if (valid.size === 0) return 0;
  let pruned = 0;
  for (const mediaId of Array.from(aiEmbeddingsMap.keys())) {
    if (!valid.has(mediaId)) {
      aiEmbeddingsMap.delete(mediaId);
      pruned++;
    }
  }
  return pruned;
};

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

let tasteEvents: TasteEventRecord[] = [];

export const insertTasteEvent = (event: Omit<TasteEventRecord, 'id'>) => {
  tasteEvents.push({
    ...event,
    id: tasteEvents.length + 1,
    timestamp: event.timestamp || Date.now(),
  });
};

export const getRecentTasteEvents = (limit: number = 300, sinceTimestamp?: number): TasteEventRecord[] => {
  const minTimestamp = sinceTimestamp ?? (Date.now() - 60 * 86400000);
  return tasteEvents
    .filter((e) => e.timestamp >= minTimestamp)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
};

export const restoreTasteEvents = (events: TasteEventRecord[]) => {
  if (!Array.isArray(events)) return;
  const existingKeys = new Set(tasteEvents.map(e => `${e.entity_type}:${e.entity_id}:${e.timestamp}`));
  for (const ev of events) {
    if (!ev || !ev.entity_type || !ev.entity_id) continue;
    const key = `${ev.entity_type}:${ev.entity_id}:${ev.timestamp}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      tasteEvents.push(ev);
    }
  }
};

export const pruneOldTasteEvents = (maxAgeDays: number = 60) => {
  const threshold = Date.now() - (maxAgeDays * 86400000);
  tasteEvents = tasteEvents.filter(e => e.timestamp >= threshold);
};

let forYouShelvesCache: Array<{
  shelfId: string;
  title: string;
  subtitle?: string | null;
  items: any[];
  sortOrder: number;
  updatedAt: number;
}> = [];

export const saveForYouShelves = (
  shelves: { shelf_id?: string; shelfId?: string; title: string; subtitle?: string | null; items: any[]; sort_order?: number; sortOrder?: number }[]
) => {
  const now = Date.now();
  forYouShelvesCache = shelves.map((s, idx) => ({
    shelfId: s.shelfId || s.shelf_id || `shelf-${idx}`,
    title: s.title,
    subtitle: s.subtitle || null,
    items: s.items || [],
    sortOrder: s.sortOrder ?? s.sort_order ?? idx,
    updatedAt: now,
  }));
};

export const getForYouCachedShelves = () => {
  return [...forYouShelvesCache];
};

export const getForYouCacheLastUpdated = (): number => {
  let max = 0;
  for (const s of forYouShelvesCache) {
    if (s.updatedAt > max) max = s.updatedAt;
  }
  return max;
};

export const clearForYouCache = () => {
  forYouShelvesCache = [];
};

// ==========================================
// EXPLORE & TMDB RESPONSE CACHE (WEB)
// ==========================================

const exploreCache: Record<number, { data: any; updatedAt: number }> = {};
const tmdbResponseCache = new Map<string, { data: any; updatedAt: number }>();

export const saveExploreContentCacheSync = (genreId: number, data: any) => {
  exploreCache[genreId] = { data, updatedAt: Date.now() };
};

export const getExploreContentCacheEntrySync = (
  genreId: number = 0
): { data: any; updatedAt: number } | null => {
  return exploreCache[genreId] ?? null;
};

export const getExploreContentCacheSync = (genreId: number = 0): any | null => {
  return exploreCache[genreId]?.data ?? null;
};

export const clearExploreCache = () => {
  for (const k of Object.keys(exploreCache)) {
    delete exploreCache[Number(k)];
  }
};

export const getTmdbResponseCacheSync = (
  cacheKey: string
): { data: any; updatedAt: number } | null => {
  const entry = tmdbResponseCache.get(cacheKey);
  if (entry) return entry;
  const raw = getStorageItem(`tmdb_${cacheKey}`);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      tmdbResponseCache.set(cacheKey, parsed);
      return parsed;
    } catch {
      removeStorageItem(`tmdb_${cacheKey}`);
    }
  }
  return null;
};

export const saveTmdbResponseCacheSync = (cacheKey: string, data: any) => {
  if (data === undefined || data === null) return;
  const entry = { data, updatedAt: Date.now() };
  tmdbResponseCache.set(cacheKey, entry);
  try {
    setStorageItem(`tmdb_${cacheKey}`, JSON.stringify(entry));
  } catch {}
};

export const clearTmdbResponseCacheSync = (keyPrefix: string = '') => {
  if (!keyPrefix) {
    tmdbResponseCache.clear();
  } else {
    for (const key of Array.from(tmdbResponseCache.keys())) {
      if (key.startsWith(keyPrefix)) {
        tmdbResponseCache.delete(key);
        removeStorageItem(`tmdb_${key}`);
      }
    }
  }
};

export type CompactCastActor = {
  id: number;
  name: string;
  profile_path: string | null;
};

const mediaCastCache = new Map<string, CompactCastActor[]>();

export const ensureCastCacheTable = () => {};

export const saveMediaCastCacheSync = (
  mediaId: number,
  mediaType: string,
  rawCast: any[]
) => {
  if (!mediaId || !Array.isArray(rawCast) || rawCast.length === 0) return;
  const normalizedType = mediaType === 'tv' ? 'tv' : 'movie';
  const mediaKey = `${normalizedType}_${mediaId}`;
  const compact: CompactCastActor[] = rawCast.slice(0, 4).map((c: any) => ({
    id: Number(c.id),
    name: String(c.name || '').trim(),
    profile_path: c.profile_path || null,
  })).filter((c: CompactCastActor) => c.name);

  if (compact.length > 0) {
    mediaCastCache.set(mediaKey, compact);
  }
};

export const batchSaveMediaCastCacheSync = (
  items: Array<{ mediaId: number; mediaType: string; rawCast: any[] }>
) => {
  for (const item of items) {
    saveMediaCastCacheSync(item.mediaId, item.mediaType, item.rawCast);
  }
};

export const getAllMediaCastCacheSync = (): Record<string, CompactCastActor[]> => {
  const result: Record<string, CompactCastActor[]> = {};
  for (const [k, v] of mediaCastCache.entries()) {
    result[k] = v;
  }
  return result;
};
