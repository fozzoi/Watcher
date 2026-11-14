import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getForYouCachedShelves,
  getExploreContentCacheEntrySync,
  saveExploreContentCacheSync,
  clearExploreCache,
  getTmdbResponseCacheSync,
  saveTmdbResponseCacheSync,
  clearTmdbResponseCacheSync,
} from './database';
import { getUserPreferences } from './userPreferences';

// ==========================================
// 1. GLOBAL CONFIGURATION & SETUP
// ==========================================

const API_BASE_URL = "https://watcher-api-rho.vercel.app/api/tmdb";
const GEMINI_MODEL = "gemini-flash-latest";

export type RequestPriority = 'high' | 'low';

export interface TmdbRequestOptions<T = any> {
  priority?: RequestPriority;
  forceRefresh?: boolean;
  skipBackgroundRevalidate?: boolean;
  throwOnError?: boolean;
  onBackgroundUpdate?: (data: T) => void;
}

export let GLOBAL_CONFIG = {
  hiRes: false,
  nsfwFilterEnabled: true,
  aiEnabled: false,
  customApiKey: ""
};

export const setGlobalConfig = <K extends keyof typeof GLOBAL_CONFIG>(
  key: K,
  value: (typeof GLOBAL_CONFIG)[K],
) => {
  const prevValue = GLOBAL_CONFIG[key];
  GLOBAL_CONFIG[key] = value;

  if (key === 'nsfwFilterEnabled' && prevValue !== value) {
    cacheEpoch++;
    requestCache.clear();
    clearTmdbResponseCacheSync();
    clearExploreCache();
  }
  if (key === 'customApiKey') {
    console.log("Global Config: Custom API Key Updated");
  }
};

export const loadGlobalConfig = async (): Promise<void> => {
  try {
    const [savedHiRes, savedNsfw] = await Promise.all([
      AsyncStorage.getItem('settings_hires'),
      AsyncStorage.getItem('settings_nsfw'),
    ]);

    if (savedHiRes !== null) {
      GLOBAL_CONFIG.hiRes = JSON.parse(savedHiRes) === true;
    }
    if (savedNsfw !== null) {
      GLOBAL_CONFIG.nsfwFilterEnabled = JSON.parse(savedNsfw) === true;
    }
  } catch (error) {
    console.warn('Failed to load persisted app settings:', error);
  }
};

const REQUEST_TIMEOUT_MS = 15000;
const AI_REQUEST_TIMEOUT_MS = 25000;

const tmdbApi = axios.create({
  baseURL: API_BASE_URL,
  params: { api_key: "" }, // Backend handles this
  timeout: REQUEST_TIMEOUT_MS,
});

tmdbApi.interceptors.response.use(
  response => response,
  error => {
    return Promise.reject(error);
  }
);

// --- CACHE SETUP WITH TTL (Time-To-Live) & SWR ---
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 Hours fresh
const PERSISTENT_STALE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 Days SWR window
const EXPLORE_REFRESH_TTL_MS = 1000 * 60 * 30; // 30 Minutes Explore SWR freshness
const AI_CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 Hours

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const MAX_AI_CACHE_ENTRIES = 100;
const requestCache = new Map<string, CacheEntry<any>>();
const aiCache = new Map<string, CacheEntry<TMDBResult[]>>();
let cacheEpoch = 0;

export const clearCache = (keyPrefix: string = "") => {
  if (keyPrefix === "") {
    cacheEpoch++;
    requestCache.clear();
    aiCache.clear();
    clearTmdbResponseCacheSync();
    clearExploreCache();
  } else {
    for (const key of requestCache.keys()) {
      if (key.startsWith(keyPrefix)) requestCache.delete(key);
    }
    clearTmdbResponseCacheSync(keyPrefix);
  }
};

// ==========================================
// 2. INTERFACES
// ==========================================

export interface TMDBImage {
  file_path: string;
  aspect_ratio: number;
  height: number;
  width: number;
  vote_average?: number;
}

export interface TMDBCastMember {
  id: number;
  name: string;
  profile_path: string | null;
  character: string;
}

export interface TMDBCrewMember {
  id: number;
  name: string;
  profile_path: string | null;
  job: string;
}

export interface TMDBExternalIds {
  imdb_id?: string;
  facebook_id?: string;
  instagram_id?: string;
  twitter_id?: string;
}

export interface TMDBVideo {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBProductionCompany {
  id: number;
  logo_path: string | null;
  name: string;
  origin_country: string;
}

export interface TMDBCollection {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

export interface TMDBCollectionDetails {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  media_type: "collection";
  parts: TMDBResult[];
}

export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  vote_average: number;
  media_type: "movie" | "tv";
  release_date?: string;
  theatrical_release_date?: string | null;
  first_air_date?: string;
  digital_release_date?: string | null;
  certification?: string;
  status?: string; 
  budget?: number; 
  revenue?: number; 
  runtime?: number; 
  tagline?: string; 
  genre_ids?: number[];
  original_language?: string;
  genres?: { id: number; name: string }[];
  vote_count?: number;
  popularity?: number;
   
  cast?: TMDBCastMember[];
  director?: TMDBCrewMember;
  directors?: TMDBCrewMember[];
  character?: string;
  number_of_seasons?: number; 
  seasons?: TMDBSeason[];
  external_ids?: TMDBExternalIds; 
  videos?: TMDBVideo[]; 
  images?: TMDBImage[];
  posters?: TMDBImage[];
   
  production_companies?: TMDBProductionCompany[];
  belongs_to_collection?: TMDBCollection | null;
}

export interface TMDBSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  poster_path: string | null;
  overview: string;
  air_date: string | null;
  episodes?: TMDBEpisode[];
}

export interface TMDBEpisode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  vote_average: number;
  runtime: number | null;
}

export interface TMDBPerson {
  id: number;
  name: string;
  profile_path: string | null;
  biography: string;
  birthday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  also_known_as?: string[];
  deathday?: string | null;
  gender?: number;
  popularity?: number;
  homepage?: string | null;
}

// ==========================================
// 3. HELPER FUNCTIONS
// ==========================================

const formatBasicItemData = (item: any): Omit<TMDBResult, 'certification' | 'cast'> => ({
  id: item.id,
  title: item.title || item.name,
  name: item.name,
  overview: item.overview || "No description available.",
  poster_path: item.poster_path,
  backdrop_path: item.backdrop_path,
  vote_average: parseFloat((item.vote_average || 0).toFixed(1)),
  vote_count: item.vote_count ?? 0,
  popularity: item.popularity ?? 0,
  media_type: item.media_type || (item.first_air_date ? "tv" : "movie"),
  release_date: item.release_date,
  first_air_date: item.first_air_date,
  number_of_seasons: item.number_of_seasons,
  genre_ids: item.genre_ids || [],
  status: item.status,
  budget: item.budget,
  revenue: item.revenue,
  runtime: item.runtime || (item.episode_run_time ? item.episode_run_time[0] : null),
  tagline: item.tagline,
  original_language: item.original_language,
});

const createCacheKey = (endpoint: string, params: Record<string, any> = {}) => {
  const sortedParams: Record<string, any> = {};
  for (const key of Object.keys(params).sort()) {
    if (params[key] !== undefined) {
      sortedParams[key] = params[key];
    }
  }
  return `${endpoint}-${JSON.stringify(sortedParams)}`;
};

const MAX_REQUEST_CACHE_ENTRIES = 300;
const MAX_CONCURRENT_TOTAL = 4;
const MAX_CONCURRENT_LOW = 2;

const inFlightRequests = new Map<string, Promise<any>>();
const backgroundRevalidations = new Map<string, Promise<void>>();
const pendingRevalidationCallbacks = new Map<string, Set<(data: any) => void>>();
const cacheWriteVersions = new Map<string, number>();

interface QueuedTask<T> {
  cacheKey: string;
  priority: RequestPriority;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

const highQueue: QueuedTask<any>[] = [];
const lowQueue: QueuedTask<any>[] = [];
const queuedTasksByKey = new Map<string, Set<QueuedTask<any>>>();
let activeTotal = 0;
let activeLow = 0;

const removeQueuedTaskReference = (task: QueuedTask<any>) => {
  const set = queuedTasksByKey.get(task.cacheKey);
  if (set) {
    set.delete(task);
    if (set.size === 0) queuedTasksByKey.delete(task.cacheKey);
  }
};

const dispatchTask = (task: QueuedTask<any>) => {
  removeQueuedTaskReference(task);
  const dispatchedAsLow = task.priority === 'low';
  activeTotal++;
  if (dispatchedAsLow) activeLow++;

  Promise.resolve()
    .then(() => task.run())
    .then(
      (res) => task.resolve(res),
      (err) => task.reject(err),
    )
    .finally(() => {
      activeTotal--;
      if (dispatchedAsLow) activeLow--;
      drainRequestQueue();
    });
};

const drainRequestQueue = () => {
  while (activeTotal < MAX_CONCURRENT_TOTAL) {
    if (highQueue.length > 0) {
      const task = highQueue.shift()!;
      dispatchTask(task);
    } else if (lowQueue.length > 0 && activeLow < MAX_CONCURRENT_LOW) {
      const task = lowQueue.shift()!;
      dispatchTask(task);
    } else {
      break;
    }
  }
};

const enqueueRequest = <T>(
  cacheKey: string,
  priority: RequestPriority,
  run: () => Promise<T>,
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const task: QueuedTask<T> = { cacheKey, priority, run, resolve, reject };
    let set = queuedTasksByKey.get(cacheKey);
    if (!set) {
      set = new Set();
      queuedTasksByKey.set(cacheKey, set);
    }
    set.add(task);
    if (priority === 'high') {
      highQueue.push(task);
    } else {
      lowQueue.push(task);
    }
    drainRequestQueue();
  });
};

const promoteQueuedRequest = (cacheKey: string) => {
  const tasks = queuedTasksByKey.get(cacheKey);
  if (!tasks || tasks.size === 0) return;
  let promoted = false;
  for (const task of tasks) {
    if (task.priority === 'low') {
      const idx = lowQueue.indexOf(task);
      if (idx !== -1) {
        lowQueue.splice(idx, 1);
        task.priority = 'high';
        highQueue.push(task);
        promoted = true;
      }
    }
  }
  if (promoted) {
    drainRequestQueue();
  }
};

const shouldPersistEndpoint = (endpoint: string): boolean => {
  return (
    /^\/(movie|tv)\/\d+/.test(endpoint) ||
    /^\/person\/\d+/.test(endpoint) ||
    /^\/collection\/\d+/.test(endpoint) ||
    endpoint === '/genre/movie/list' ||
    endpoint === '/genre/tv/list' ||
    /^\/trending\/(all|movie|tv)\/day$/.test(endpoint)
  );
};

const setMemoryCacheEntry = (cacheKey: string, entry: CacheEntry<any>) => {
  if (requestCache.has(cacheKey)) {
    requestCache.delete(cacheKey);
  } else if (requestCache.size >= MAX_REQUEST_CACHE_ENTRIES) {
    const oldestKey = requestCache.keys().next().value;
    if (oldestKey) requestCache.delete(oldestKey);
  }
  requestCache.set(cacheKey, entry);
};

const getCacheEntry = (cacheKey: string, endpoint: string): CacheEntry<any> | null => {
  const mem = requestCache.get(cacheKey);
  if (mem) {
    // True LRU promotion
    requestCache.delete(cacheKey);
    requestCache.set(cacheKey, mem);
    return mem;
  }

  if (shouldPersistEndpoint(endpoint)) {
    const persisted = getTmdbResponseCacheSync(cacheKey);
    if (persisted && persisted.data !== undefined && persisted.data !== null) {
      const entry: CacheEntry<any> = {
        data: persisted.data,
        timestamp: persisted.updatedAt,
      };
      setMemoryCacheEntry(cacheKey, entry);
      return entry;
    }
  }

  return null;
};

const saveCacheEntry = (cacheKey: string, endpoint: string, data: any) => {
  cacheWriteVersions.set(cacheKey, (cacheWriteVersions.get(cacheKey) || 0) + 1);
  const entry: CacheEntry<any> = { data, timestamp: Date.now() };
  setMemoryCacheEntry(cacheKey, entry);
  if (shouldPersistEndpoint(endpoint)) {
    saveTmdbResponseCacheSync(cacheKey, data);
  }
};

const executeHttpWithRetry = async (
  endpoint: string,
  params: Record<string, any>,
  maxRetries: number,
) => {
  let lastError: any = null;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Build full URL query string
  const queryParts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  const fullUrl = `${API_BASE_URL}${cleanEndpoint}${queryString}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Use native fetch: avoids React Native Axios/XMLHttpRequest OkHttp socket drops
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          let parsedError: any;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            parsedError = { error: errorText || `HTTP ${response.status}` };
          }
          const httpError: any = new Error(parsedError.error || `Request failed with status ${response.status}`);
          httpError.response = { status: response.status, data: parsedError };
          throw httpError;
        }

        const data = await response.json();
        return data;
      } catch (innerErr) {
        clearTimeout(timeoutId);
        throw innerErr;
      }
    } catch (error: any) {
      lastError = error;
      const statusCode = error.response?.status;
      const isTimeout =
        error.name === 'AbortError' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        (typeof error.message === 'string' && error.message.toLowerCase().includes('timeout'));

      const isRetryable =
        !isTimeout &&
        (!statusCode ||
          statusCode === 408 ||
          statusCode === 429 ||
          (statusCode >= 500 && statusCode < 600));

      if (attempt < maxRetries && isRetryable) {
        const delay = Math.min(600, 150 * Math.pow(2, attempt) + Math.floor(Math.random() * 100));
        console.warn(`[TMDB] ${endpoint} attempt ${attempt + 1} failed (${error.message}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }
  throw lastError;
};

const scheduleBackgroundRevalidation = (
  cacheKey: string,
  endpoint: string,
  params: Record<string, any>,
  previousData: any,
  onBackgroundUpdate?: (data: any) => void,
) => {
  const existingInFlight = inFlightRequests.get(cacheKey);
  if (existingInFlight) {
    if (onBackgroundUpdate) {
      existingInFlight
        .then((freshData) => {
          let changed = true;
          try {
            changed = JSON.stringify(freshData) !== JSON.stringify(previousData);
          } catch {
            changed = true;
          }
          if (changed) {
            onBackgroundUpdate(freshData);
          }
        })
        .catch(() => {});
    }
    return;
  }

  if (onBackgroundUpdate) {
    let set = pendingRevalidationCallbacks.get(cacheKey);
    if (!set) {
      set = new Set();
      pendingRevalidationCallbacks.set(cacheKey, set);
    }
    set.add(onBackgroundUpdate);
  }

  if (backgroundRevalidations.has(cacheKey)) {
    return;
  }

  const startEpoch = cacheEpoch;
  const startVersion = cacheWriteVersions.get(cacheKey) || 0;

  const bgPromise = enqueueRequest(cacheKey, 'low', () => executeHttpWithRetry(endpoint, params, 0))
    .then((freshData) => {
      const callbacks = pendingRevalidationCallbacks.get(cacheKey);
      pendingRevalidationCallbacks.delete(cacheKey);
      if (startEpoch !== cacheEpoch || (cacheWriteVersions.get(cacheKey) || 0) !== startVersion) {
        return;
      }
      let changed = true;
      try {
        changed = JSON.stringify(freshData) !== JSON.stringify(previousData);
      } catch {
        changed = true;
      }
      saveCacheEntry(cacheKey, endpoint, freshData);
      if (changed && callbacks) {
        callbacks.forEach((cb) => {
          try {
            cb(freshData);
          } catch {}
        });
      }
    })
    .catch(() => {
      pendingRevalidationCallbacks.delete(cacheKey);
    })
    .finally(() => {
      backgroundRevalidations.delete(cacheKey);
    });

  backgroundRevalidations.set(cacheKey, bgPromise);
};

const fetchWithCache = async (
  endpoint: string,
  params: Record<string, any> = {},
  options?: TmdbRequestOptions,
) => {
  params = { ...params };
  if (GLOBAL_CONFIG.nsfwFilterEnabled) {
    params.include_adult = false;
    if (endpoint.includes('discover')) {
      params.certification_country = "US";
      params['certification.lte'] = "PG-13";
    }
  } else {
    params.include_adult = true;
  }

  // TMDB /search/collection throws 422 if include_adult is provided
  if (endpoint.includes('/collection')) {
    delete params.include_adult;
  }

  const cacheKey = createCacheKey(endpoint, params);
  const priority: RequestPriority = options?.priority ?? 'high';
  const startEpoch = cacheEpoch;
  const cached = getCacheEntry(cacheKey, endpoint);

  if (!options?.forceRefresh && cached) {
    const age = Date.now() - cached.timestamp;
    if (age <= CACHE_TTL_MS) {
      return cached.data;
    }
    if (age <= PERSISTENT_STALE_TTL_MS) {
      if (!options?.skipBackgroundRevalidate) {
        scheduleBackgroundRevalidation(cacheKey, endpoint, params, cached.data, options?.onBackgroundUpdate);
      }
      return cached.data;
    }
  }

  // Deduplicate concurrent identical in-flight requests
  if (inFlightRequests.has(cacheKey)) {
    if (priority === 'high') {
      promoteQueuedRequest(cacheKey);
    }
    return inFlightRequests.get(cacheKey)!;
  }

  const maxRetries = 1;

  const fetchPromise = enqueueRequest(cacheKey, priority, async () => {
    try {
      const data = await executeHttpWithRetry(endpoint, params, maxRetries);
      if (startEpoch === cacheEpoch) {
        saveCacheEntry(cacheKey, endpoint, data);
      }
      return data;
    } catch (error) {
      if (cached && !options?.forceRefresh && startEpoch === cacheEpoch) {
        console.warn(`[TMDB] Retries failed for ${endpoint}. Serving stale cached data fallback.`);
        return cached.data;
      }
      throw error;
    }
  });

  inFlightRequests.set(cacheKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
};

const fetchDoublePage = async (
  endpoint: string,
  params: any = {},
  mediaType: "movie" | "tv",
  options?: TmdbRequestOptions,
) => {
  try {
    const page1 = await fetchWithCache(endpoint, { ...params, page: 1 }, options);
    const results = page1.results || [];
    return results.map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getImageUrl = (path: string | null, size: string = "w500"): string => {
  if (!path) return "https://via.placeholder.com/500x750?text=No+Image";

  // 1. Small cards & thumbnails are PROTECTED from memory inflation:
  // w185, w154, w92, and card-size w342 are locked to prevent huge bitmap RAM usage
  if (size === "w185" || size === "w154" || size === "w92" || size === "w342") {
    return `https://image.tmdb.org/t/p/${size}${path}`;
  }

  // 2. Explicit zoom requests always receive the fullest resolution
  if (size === "original") {
    return `https://image.tmdb.org/t/p/original${path}`;
  }

  let finalSize = size;
  // 3. Hi-Res applies ONLY to featured headers, backdrops, and hero banners
  if (GLOBAL_CONFIG.hiRes) {
    if (size === "w500") finalSize = "w780";
    else if (size === "w780") finalSize = "w1280";
    else if (size === "h632") finalSize = "original";
  }
  return `https://image.tmdb.org/t/p/${finalSize}${path}`;
};

// ==========================================
// 4. TMDB FETCH FUNCTIONS 
// ==========================================

export const getDiscoverMedia = async (
    type: 'movie' | 'tv' = 'movie',
    page: number = 1,
    filters: { genreId?: number | null; year?: string; language?: string; rating?: number },
    baseCategory?: string,
    options?: TmdbRequestOptions,
  ): Promise<TMDBResult[]> => {
    
    const params: any = { sort_by: 'popularity.desc' };

    if (baseCategory) {
        const bc = baseCategory.toLowerCase();
        if (bc === 'toprated') { params.sort_by = 'vote_average.desc'; params['vote_count.gte'] = 300; }
        else if (bc === 'regional') { params.region = 'IN'; }
        else if (bc.includes('hindi')) { params.with_original_language = 'hi'; }
        else if (bc.includes('malayalam')) { params.with_original_language = 'ml'; }
        else if (bc.includes('tamil')) { params.with_original_language = 'ta'; }
        else if (bc.includes('korean')) { params.with_original_language = 'ko'; }
        else if (bc.includes('japanese')) { params.with_original_language = 'ja'; }
        else if (bc === 'animatedmovies') { params.with_genres = '16'; }
        else if (bc === 'animemovies' || bc === 'animeshows') { 
            params.with_genres = '16'; 
            params.with_keywords = '210024'; 
            params.with_original_language = 'ja'; 
        }
        else if (bc === 'hiddengems') { params['vote_average.gte'] = 7.5; params['vote_count.gte'] = 100; params.sort_by = 'vote_average.desc'; }
        else if (bc === 'nostalgia') { params['primary_release_date.gte'] = '1990-01-01'; params['primary_release_date.lte'] = '2005-12-31'; }
        else if (bc.startsWith('genre/')) { params.with_genres = bc.split('/')[1]; }
    }
  
    if (filters.genreId) params.with_genres = params.with_genres ? `${params.with_genres},${filters.genreId}` : filters.genreId;
    if (filters.language) params.with_original_language = filters.language;
    if (filters.rating) params['vote_average.gte'] = filters.rating;
    
    if (filters.year) {
       if (type === 'movie') params.primary_release_year = filters.year;
       else params.first_air_date_year = filters.year;
    }
  
    if (page === 1) {
        return await fetchDoublePage(`/discover/${type}`, params, type, options);
    } else {
        params.page = page;
        try {
            const data = await fetchWithCache(`/discover/${type}`, params, options);
            return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: type }));
        } catch (error) {
            if (options?.throwOnError) throw error;
            return [];
        }
    }
};

export const getTrendingMovies = async (
    page: number = 1,
    genreId?: number,
    options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/movie" : "/trending/movie/week";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "popularity.desc"; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "movie", options);
    
    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params, options);
      return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
    } catch (error) {
      if (options?.throwOnError) throw error;
      return [];
    }
};

export const getTrendingTV = async (
    page: number = 1,
    genreId?: number,
    options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/tv" : "/trending/tv/week";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "popularity.desc"; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "tv", options);

    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params, options);
      return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "tv" }));
    } catch (error) {
      if (options?.throwOnError) throw error;
      return [];
    }
};

export const getTrendingToday = async (
    mediaType: "all" | "movie" | "tv" = "all",
    page: number = 1,
    options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
    const endpoint = `/trending/${mediaType}/day`;
    const params: any = { page };
    try {
      const data = await fetchWithCache(endpoint, params, options);
      const results = data.results || [];
      return results.map((item: any) => ({
        ...formatBasicItemData(item),
        media_type: item.media_type || (item.first_air_date ? "tv" : "movie"),
      }));
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return await getTrendingMovies(page, undefined, options);
      }
      if (options?.throwOnError) throw error;
      return [];
    }
};

export const getTopRated = async (
    page: number = 1,
    genreId?: number,
    options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
    const endpoint = genreId ? "/discover/movie" : "/movie/top_rated";
    const params: any = {};
    if (genreId) { params.with_genres = genreId; params.sort_by = "vote_average.desc"; params["vote_count.gte"] = 300; }
    
    if (page === 1) return await fetchDoublePage(endpoint, params, "movie", options);

    params.page = page;
    try {
      const data = await fetchWithCache(endpoint, params, options);
      return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
    } catch (error) {
      if (options?.throwOnError) throw error;
      return [];
    }
};

export const getRegionalMovies = async (
  region: string = 'IN',
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { region, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getLanguageMovies = async (
  language: string,
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { with_original_language: language, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getLanguageTV = async (
  language: string,
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { with_original_language: language, sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/tv", params, "tv", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/tv", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "tv" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const discoverMovies = async (
  params: Record<string, any> = {},
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/discover/movie", { ...params, page }, options);
    return (data.results || []).map((item: any) => ({
      ...formatBasicItemData(item),
      media_type: "movie" as const,
    }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const discoverTV = async (
  params: Record<string, any> = {},
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/discover/tv", { ...params, page }, options);
    return (data.results || []).map((item: any) => ({
      ...formatBasicItemData(item),
      media_type: "tv" as const,
    }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};


const ANIME_GENRE_ID = 16;
const ANIME_KEYWORD_ID = 210024;
export const getAnimeContent = async (
  page: number = 1,
  isMovie: boolean = true,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const mediaType = isMovie ? 'movie' : 'tv';
  const genres = genreId ? `${ANIME_GENRE_ID},${genreId}` : `${ANIME_GENRE_ID}`;
  const params: any = { with_genres: genres, with_keywords: ANIME_KEYWORD_ID, with_original_language: 'ja', sort_by: 'popularity.desc' };
  
  if (page === 1) return await fetchDoublePage(`/discover/${mediaType}`, params, mediaType, options);

  params.page = page;
  try {
    const data = await fetchWithCache(`/discover/${mediaType}`, params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getAnimatedMovies = async (
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const genres = genreId ? `${ANIME_GENRE_ID},${genreId}` : `${ANIME_GENRE_ID}`;
  const params: any = { with_genres: genres, sort_by: 'popularity.desc' };
  
  if (page === 1) return await fetchDoublePage('/discover/movie', params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache('/discover/movie', params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: 'movie' }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getUpcomingMovies = async (
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { region: 'US' }; // Updated to match Tauri
  if (page === 1) return await fetchDoublePage("/movie/upcoming", params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/movie/upcoming", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getHiddenGems = async (
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { "vote_average.gte": 7.5, "vote_count.gte": 100, "vote_count.lte": 3000, sort_by: "vote_average.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getNostalgicMovies = async (
  page: number = 1,
  genreId?: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const params: any = { "primary_release_date.gte": "1990-01-01", "primary_release_date.lte": "2005-12-31", sort_by: "popularity.desc" };
  if (genreId) params.with_genres = genreId;
  
  if (page === 1) return await fetchDoublePage("/discover/movie", params, "movie", options);

  params.page = page;
  try {
    const data = await fetchWithCache("/discover/movie", params, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};


// ─── "Because you watched X" ─────────────────────────────────────────────────

export const getSimilarForHistory = async (history: any[]): Promise<{ sourceTitle: string; items: any[] }[]> => {
  const recent = history.slice(0, 2); // last 2 watched
  const results = await Promise.all(
    recent.map(async (item) => {
      try {
        const mediaType: "movie" | "tv" = item.media_type === 'tv' || item.first_air_date ? 'tv' : 'movie';
        const similar = await getSimilarMedia(Number(item.id), mediaType, 1, { priority: 'low' });
        return { sourceTitle: item.title || item.name || '', items: similar.slice(0, 10) };
      } catch {
        return null;
      }
    })
  );
  return results.filter((r): r is { sourceTitle: string; items: any[] } => r !== null && r.items.length > 0);
};

// ==========================================
// 5. BATCH FETCH WITH ASYNC STORAGE (OFFLINE-FIRST)
// ==========================================

export const fetchAllDiscoveryContent = async (genreId?: number, forceRefresh = false) => {
  const gId = genreId === 0 ? undefined : genreId;
  const cacheKey = `EXPLORE_PAGE_DATA_${gId || 'ALL'}`;

  if (!forceRefresh) {
      try {
          const savedData = await AsyncStorage.getItem(cacheKey);
          if (savedData) {
              const parsed = JSON.parse(savedData);
              fetchFreshDiscoveryContent(gId, cacheKey); 
              return parsed;
          }
      } catch (e) {
          console.log("Failed to load local cache", e);
      }
  }

  return await fetchFreshDiscoveryContent(gId, cacheKey);
};

const fetchFreshDiscoveryContent = async (gId: number | undefined, cacheKey: string) => {
  try {
    const priorityResults = await Promise.all([
      getTrendingMovies(1, gId), getTrendingTV(1, gId), getTopRated(1, gId),
      getRegionalMovies('IN', 1, gId), getUpcomingMovies(1)
    ]);

    const secondaryResults = await Promise.all([
      getLanguageMovies('hi', 1, gId), getLanguageMovies('ml', 1, gId), getLanguageMovies('ta', 1, gId),
      getLanguageTV('hi', 1, gId), getLanguageTV('ml', 1, gId),
      getLanguageMovies('ko', 1, gId), getLanguageTV('ko', 1, gId),
      getLanguageMovies('ja', 1, gId), getLanguageTV('ja', 1, gId),
      getAnimeContent(1, true, gId), getAnimeContent(1, false, gId), getAnimatedMovies(1, gId),
      getHiddenGems(1, gId), getNostalgicMovies(1, gId), getLanguageMovies('zh', 1, gId)
      ]);
    
    const finalData = {
      trendingMovies: priorityResults[0], trendingTV: priorityResults[1], topRated: priorityResults[2], 
      regional: priorityResults[3], upcoming: priorityResults[4],
      
      hindiMovies: secondaryResults[0], malayalamMovies: secondaryResults[1], tamilMovies: secondaryResults[2],
      hindiTV: secondaryResults[3], malayalamTV: secondaryResults[4],
      koreanMovies: secondaryResults[5], koreanTV: secondaryResults[6],
      japaneseMovies: secondaryResults[7], japaneseTV: secondaryResults[8],
      animeMovies: secondaryResults[9], animeShows: secondaryResults[10], animatedMovies: secondaryResults[11],
      hiddenGems: secondaryResults[12], nostalgia: secondaryResults[13], chineseMovies: secondaryResults[14]
      };

    AsyncStorage.setItem(cacheKey, JSON.stringify(finalData)).catch(err => console.log(err));

    return finalData;
  } catch (error) {
    console.error("Error fetching discovery content:", error);
    return null;
  }
};

// ==========================================
// 6. DETAILS & OTHERS
// ==========================================

/**
 * Lightweight collection lookup for telemetry & franchise detection.
 * Calls bare GET /movie/{id} without append_to_response (no images, credits, videos).
 * Consumes < 2KB instead of 150KB.
 */
export const getMovieCollectionId = async (
  movieId: number,
  options?: TmdbRequestOptions,
): Promise<number | null> => {
  try {
    const data = await fetchWithCache(`/movie/${movieId}`, {}, options);
    return data?.belongs_to_collection?.id ? Number(data.belongs_to_collection.id) : null;
  } catch {
    return null;
  }
};

export const getMovieCollectionInfo = async (
  movieId: number,
  options?: TmdbRequestOptions,
): Promise<{ id: number; name: string } | null> => {
  try {
    const data = await fetchWithCache(`/movie/${movieId}`, {}, options);
    if (data?.belongs_to_collection?.id) {
      return {
        id: Number(data.belongs_to_collection.id),
        name: data.belongs_to_collection.name || '',
      };
    }
    return null;
  } catch {
    return null;
  }
};

const buildFullDetailsResult = (
  item: TMDBResult,
  data: any,
  resolvedMediaType: "movie" | "tv",
  preferredCountry: string,
): TMDBResult => {
  let certification: any = null;
  let digital_release_date: string | null = null;
  let theatrical_release_date: string | null = null;
  if (resolvedMediaType === "movie") {
    const allReleases = data.release_dates?.results || [];
    const regionalReleases = allReleases.find((r: any) => r.iso_3166_1 === preferredCountry)?.release_dates || [];
    const usRelease = allReleases.find((r: any) => r.iso_3166_1 === "US");
    certification = usRelease?.release_dates?.[0]?.certification || null;

    // Keep alert dates territory-specific so another country's premiere isn't reported as local.
    // TMDB release types: 2 = limited theatrical, 3 = theatrical, 4 = digital.
    const theatrical = regionalReleases
      .filter((d: any) => (d.type === 2 || d.type === 3) && d.release_date)
      .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));
    const digital = regionalReleases
      .filter((d: any) => d.type === 4 && d.release_date)
      .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));
    theatrical_release_date = theatrical[0]?.release_date || null;
    digital_release_date = digital[0]?.release_date || null;
  } else {
    const usRating = data.content_ratings?.results?.find((r: any) => r.iso_3166_1 === "US");
    certification = usRating?.rating || null;
  }

  const cast = (data.credits?.cast || []).map((member: any) => ({
    id: member.id,
    name: member.name || "Unknown Actor",
    profile_path: member.profile_path || null,
    character: member.character || "Unknown Character"
  }));

  const directorsMap = new Map<number, TMDBCrewMember>();
  if (Array.isArray(data.created_by)) {
    for (const c of data.created_by) {
      if (c?.id && !directorsMap.has(c.id)) {
        directorsMap.set(c.id, {
          id: c.id,
          name: c.name || "Unknown Creator",
          profile_path: c.profile_path || null,
          job: "Creator"
        });
      }
    }
  }
  if (Array.isArray(data.credits?.crew)) {
    for (const m of data.credits.crew) {
      if (m?.id && m.job === "Director" && !directorsMap.has(m.id)) {
        directorsMap.set(m.id, {
          id: m.id,
          name: m.name || "Unknown Director",
          profile_path: m.profile_path || null,
          job: "Director"
        });
      }
    }
  }
  const directors = Array.from(directorsMap.values());
  const director: TMDBCrewMember | undefined = directors[0];

  let seasonsData = [];
  if (resolvedMediaType === "tv") {
    seasonsData = data.seasons || [];
  }

  return {
    ...item,
    ...formatBasicItemData(data),
    media_type: resolvedMediaType,
    genres: data.genres || [],
    certification,
    theatrical_release_date,
    digital_release_date,
    cast,
    director,
    directors,
    seasons: seasonsData,
    external_ids: data.external_ids,
    videos: data.videos?.results || [],
    images: data.images?.backdrops || [],
    posters: data.images?.posters || [],
    production_companies: data.production_companies || [],
    belongs_to_collection: data.belongs_to_collection || null,
  };
};

export const getFullDetails = async (
  item: TMDBResult,
  preferredCountry = 'US',
  options?: TmdbRequestOptions<TMDBResult>,
): Promise<TMDBResult> => {
  let resolvedMediaType: "movie" | "tv" = item.media_type || (item.first_air_date ? "tv" : "movie");
  const append = "credits,release_dates,content_ratings,external_ids,videos";

  const makeFetchOptions = (targetType: "movie" | "tv"): TmdbRequestOptions | undefined => {
    if (!options) return undefined;
    return {
      ...options,
      onBackgroundUpdate: options.onBackgroundUpdate
        ? (rawFresh: any) => options.onBackgroundUpdate!(buildFullDetailsResult(item, rawFresh, targetType, preferredCountry))
        : undefined,
    };
  };

  let data: any;
  try {
    data = await fetchWithCache(`/${resolvedMediaType}/${item.id}`, { append_to_response: append }, makeFetchOptions(resolvedMediaType));
  } catch (err: any) {
    // Only fall back to the opposite media type on a genuine 404 / not-found,
    // never on timeouts, rate limits, or server/network errors.
    const status = err?.response?.status;
    const isNotFound = status === 404 || err?.response?.data?.status_code === 34;
    if (!isNotFound) {
      throw err;
    }
    const fallbackType: "movie" | "tv" = resolvedMediaType === "tv" ? "movie" : "tv";
    data = await fetchWithCache(`/${fallbackType}/${item.id}`, { append_to_response: append }, makeFetchOptions(fallbackType));
    resolvedMediaType = fallbackType;
  }

  return buildFullDetailsResult(item, data, resolvedMediaType, preferredCountry);
};

export const getMediaImages = async (
  id: number,
  mediaType: "movie" | "tv" = "movie",
  options?: TmdbRequestOptions,
): Promise<{ backdrops: TMDBImage[]; posters: TMDBImage[] }> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/images`, {}, options);
    return {
      backdrops: data.backdrops || [],
      posters: data.posters || [],
    };
  } catch (error) {
    if (options?.throwOnError) throw error;
    return { backdrops: [], posters: [] };
  }
};

export const getMediaDetails = async (
  id: number,
  mediaType: "movie" | "tv",
  preferredCountry = 'US',
  options?: TmdbRequestOptions<TMDBResult>,
): Promise<TMDBResult> => {
  return await getFullDetails({ id, media_type: mediaType } as TMDBResult, preferredCountry, options);
};

export const getMovieGenres = async (id: number, mediaType: "movie" | "tv" = "movie"): Promise<{ id: number; name: string }[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}`);
    return data.genres || [];
  } catch (error) { return []; }
};

export const getTVShowSeasons = async (tvId: number): Promise<TMDBSeason[]> => {
  try {
    const data = await fetchWithCache(`/tv/${tvId}`);
    return data.seasons || [];
  } catch (error) { return []; }
};

export const getSeasonEpisodes = async (
  tvId: number,
  seasonNumber: number,
  options?: TmdbRequestOptions<TMDBEpisode[]>,
): Promise<TMDBEpisode[]> => {
  const fetchOptions: TmdbRequestOptions | undefined = options
    ? {
        ...options,
        onBackgroundUpdate: options.onBackgroundUpdate
          ? (raw: any) => options.onBackgroundUpdate!(raw?.episodes || [])
          : undefined,
      }
    : undefined;
  const data = await fetchWithCache(`/tv/${tvId}/season/${seasonNumber}`, {}, fetchOptions);
  return data.episodes || [];
};

export const getSimilarMedia = async (
  id: number,
  mediaType: "movie" | "tv",
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/recommendations`, { page }, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: mediaType }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getPersonDetails = async (
  personId: number,
  options?: TmdbRequestOptions<TMDBPerson>,
): Promise<TMDBPerson> => {
  return await fetchWithCache(`/person/${personId}`, {}, options);
};

export const getPersonCombinedCredits = async (
  personId: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const data = await fetchWithCache(`/person/${personId}/combined_credits`, {}, options);
  
  const castItems = data.cast || [];
  const crewItems = data.crew || [];

  // Filter the crew array to only get items where they were the Director
  const directorialWorks = crewItems.filter((item: any) => item.job === "Director");

  // Combine acting and directing arrays
  const combined = [...castItems, ...directorialWorks];
  
  // Remove duplicates (e.g., if they act and direct in the same movie)
  const uniqueItems = Array.from(new Map(combined.map((item: any) => [item.id, item])).values());

  return uniqueItems.map((item: any) => ({
    ...formatBasicItemData(item),
    media_type: item.media_type || (item.title ? "movie" : "tv"),
    character: item.character || item.job || null
  }));
};

export const getPersonImages = async (
  personId: number,
  options?: TmdbRequestOptions,
): Promise<TMDBImage[]> => {
  try {
    const data = await fetchWithCache(`/person/${personId}/images`, {}, options);
    return data.profiles || [];
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const getMovieImages = async (movieId: number, mediaType: "movie" | "tv"): Promise<TMDBImage[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${movieId}/images`);
    const images = [...(data.posters || []), ...(data.backdrops || [])];
    return images.slice(0, 20);
  } catch (error) { return []; }
};

export const getExternalIds = async (id: number, mediaType: "movie" | "tv"): Promise<TMDBExternalIds> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/external_ids`);
    return data;
  } catch (error) { return {}; }
};

export const getTrailers = async (id: number, mediaType: "movie" | "tv"): Promise<TMDBVideo[]> => {
  try {
    const data = await fetchWithCache(`/${mediaType}/${id}/videos`);
    return data.results || [];
  } catch (error) { return []; }
};

export const getCollectionDetails = async (
  collectionId: number,
  options?: TmdbRequestOptions<TMDBCollectionDetails | null>,
): Promise<TMDBCollectionDetails | null> => {
  const formatCol = (data: any): TMDBCollectionDetails => ({
    id: data.id,
    name: data.name,
    overview: data.overview || "",
    poster_path: data.poster_path,
    backdrop_path: data.backdrop_path,
    media_type: 'collection',
    parts: (data.parts || []).map((item: any) => ({
      ...formatBasicItemData(item),
      media_type: "movie" as const,
    })),
  });

  try {
    const fetchOptions: TmdbRequestOptions | undefined = options
      ? {
          ...options,
          onBackgroundUpdate: options.onBackgroundUpdate
            ? (raw: any) => options.onBackgroundUpdate!(formatCol(raw))
            : undefined,
        }
      : undefined;
    const data = await fetchWithCache(`/collection/${collectionId}`, {}, fetchOptions);
    return formatCol(data);
  } catch (error) {
    if (options?.throwOnError) throw error;
    return null;
  }
};

export const parseQueryYear = (rawQuery: string): { cleanTitle: string; year?: string } => {
  const trimmed = rawQuery.trim();
  if (!trimmed) return { cleanTitle: '' };

  // 1. Year in parentheses or brackets: e.g. "Avatar (2009)", "Dune [2021]"
  const parenMatch = trimmed.match(/[\(\[]\s*(\b(?:18|19|20)\d{2}\b)\s*[\)\]]/);
  if (parenMatch) {
    const candidateTitle = trimmed.replace(/[\(\[]\s*\b(?:18|19|20)\d{2}\b\s*[\)\]]/, '').trim();
    if (candidateTitle.length > 0) {
      return { cleanTitle: candidateTitle, year: parenMatch[1] };
    }
  }

  // 2. Trailing 4-digit year: e.g. "Avatar 2009", "The Batman 2022"
  const trailMatch = trimmed.match(/\b((?:18|19|20)\d{2})\b\s*$/);
  if (trailMatch) {
    const candidateTitle = trimmed.replace(/\b(?:18|19|20)\d{2}\b\s*$/, '').trim();
    if (candidateTitle.length > 0) {
      return { cleanTitle: candidateTitle, year: trailMatch[1] };
    }
  }

  // 3. Leading 4-digit year followed by title: e.g. "2009 Avatar"
  const leadMatch = trimmed.match(/^\s*\b((?:18|19|20)\d{2})\b\s+/);
  if (leadMatch) {
    const candidateTitle = trimmed.replace(/^\s*\b(?:18|19|20)\d{2}\b\s+/, '').trim();
    if (candidateTitle.length > 0) {
      return { cleanTitle: candidateTitle, year: leadMatch[1] };
    }
  }

  return { cleanTitle: trimmed };
};

export const searchTMDB = async (
  query: string,
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const { cleanTitle, year } = parseQueryYear(trimmed);

    // If no year was detected or the query is just a single token/year (e.g. "2012", "1917"),
    // perform standard multi-search.
    if (!year || !cleanTitle) {
      const data = await fetchWithCache("/search/multi", { query: trimmed, page }, options);
      return (data.results || []).map((item: any) => formatBasicItemData(item));
    }

    // When a year is detected alongside a title (e.g. "Avatar 2009", "The Batman (2022)"):
    // Query raw multi, targeted movie search with year, and targeted tv search with year concurrently.
    const settled = await Promise.allSettled([
      fetchWithCache("/search/multi", { query: trimmed, page }, options),
      fetchWithCache("/search/movie", { query: cleanTitle, primary_release_year: year, page }, options)
        .then((res: any) => ({
          results: (res.results || []).map((m: any) => ({ ...m, media_type: "movie" })),
        })),
      fetchWithCache("/search/tv", { query: cleanTitle, first_air_date_year: year, page }, options)
        .then((res: any) => ({
          results: (res.results || []).map((m: any) => ({ ...m, media_type: "tv" })),
        })),
      fetchWithCache("/search/multi", { query: cleanTitle, page }, options),
    ]);

    if (settled.every((s) => s.status === 'rejected')) {
      throw (settled[0] as PromiseRejectedResult).reason;
    }

    const rawMulti = settled[0].status === 'fulfilled' ? settled[0].value : { results: [] };
    const movieYear = settled[1].status === 'fulfilled' ? settled[1].value : { results: [] };
    const tvYear = settled[2].status === 'fulfilled' ? settled[2].value : { results: [] };
    const cleanMulti = settled[3].status === 'fulfilled' ? settled[3].value : { results: [] };

    const rawList = rawMulti?.results || [];
    const movieYearList = movieYear?.results || [];
    const tvYearList = tvYear?.results || [];
    const cleanList = cleanMulti?.results || [];

    const yearMatched = [...movieYearList, ...tvYearList];
    const cleanTitleLower = cleanTitle.toLowerCase();

    // Sort year-matched items: exact title matches first, then by popularity
    yearMatched.sort((a: any, b: any) => {
      const aTitle = (a.title || a.name || "").toLowerCase();
      const bTitle = (b.title || b.name || "").toLowerCase();
      const aExact = aTitle === cleanTitleLower;
      const bExact = bTitle === cleanTitleLower;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return (b.popularity || 0) - (a.popularity || 0);
    });

    const seenIds = new Set<number>();
    const finalResults: TMDBResult[] = [];

    const addItem = (rawItem: any) => {
      if (!rawItem || !rawItem.id || seenIds.has(rawItem.id)) return;
      seenIds.add(rawItem.id);
      finalResults.push(formatBasicItemData(rawItem));
    };

    // 1. Highest priority: targeted movie/tv search matching the year
    for (const item of yearMatched) {
      addItem(item);
    }

    // 2. High priority: raw multi results that matched the full query string (e.g. "Blade Runner 2049")
    for (const item of rawList) {
      addItem(item);
    }

    // 3. Medium priority: clean multi items whose release_date or first_air_date matches the target year
    for (const item of cleanList) {
      const itemYear = (item.release_date || item.first_air_date || "").slice(0, 4);
      if (itemYear === year) {
        addItem(item);
      }
    }

    // 4. Fallback: remaining clean multi items
    for (const item of cleanList) {
      addItem(item);
    }

    return finalResults;
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const searchCollections = async (
  query: string,
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/search/collection", { query, page }, options);
    return (data.results || []).map((item: any) => ({
      id: item.id,
      title: item.name,
      name: item.name,
      poster_path: item.poster_path,
      backdrop_path: item.backdrop_path,
      media_type: "collection",
      overview: item.overview,
    }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const searchPeople = async (
  query: string,
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBPerson[]> => {
  try {
    const data = await fetchWithCache("/search/person", { query, page }, options);
    return (data.results || []).map((person: any) => ({
      id: person.id,
      name: person.name,
      profile_path: person.profile_path,
      popularity: person.popularity,
      known_for_department: person.known_for_department
    }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const searchGenres = async (query: string): Promise<{ id: number; name: string }[]> => {
  try {
    const [movieGenres, tvGenres] = await Promise.all([ fetchWithCache("/genre/movie/list"), fetchWithCache("/genre/tv/list") ]);
    const allGenres = [...movieGenres.genres, ...tvGenres.genres];
    const uniqueGenres = Array.from(new Map(allGenres.map((g: any) => [g.id, g])).values());
    return uniqueGenres.filter((genre: any) => genre.name.toLowerCase().includes(query.toLowerCase()));
  } catch (error) { return []; }
};

interface ActiveExploreRefresh {
  promise: Promise<any>;
  priority: RequestPriority;
}

const inFlightExploreRefreshes = new Map<string, ActiveExploreRefresh>();

export const fetchPersonalisedDiscoveryContent = async (
  languages: string[] = ['en'],
  genreIds: number[] = [],
  genreFilterId: number = 0,
  forceRefresh = false,
  favoriteActors: any[] = [],
  onBackgroundUpdate?: (data: any) => void,
) => {
  const gId = genreFilterId === 0 ? undefined : genreFilterId;
  const actorsKey = (favoriteActors || []).map((a: any) => a.id).join('_');
  const configHash = `nsfw:${GLOBAL_CONFIG.nsfwFilterEnabled ? 1 : 0}|genres:${genreIds.join(',')}|actors:${actorsKey}`;
  const cacheKey = `PERSONALISED_PAGE_DATA_${languages.join('_')}_${genreIds.join('_')}_${actorsKey}_${gId || 'ALL'}`;

  const isCompatibleCache = (entry: any): boolean => {
    if (!entry) return false;
    const cachedLangs = entry.langData ? Object.keys(entry.langData) : [];
    const hasAllLangs = languages.length === 0 || languages.every((l) => cachedLangs.includes(l));
    if (!hasAllLangs) return false;
    if (entry._configHash && entry._configHash !== configHash) return false;
    return true;
  };

  const scheduleBackgroundExploreRefresh = () => {
    const promise = fetchFreshPersonalisedContent(
      languages,
      genreIds,
      favoriteActors,
      gId,
      cacheKey,
      configHash,
      genreFilterId,
      'low',
    );
    if (onBackgroundUpdate) {
      promise
        .then((fresh) => {
          if (fresh) onBackgroundUpdate(fresh);
        })
        .catch(() => {});
    } else {
      promise.catch(() => {});
    }
  };

  if (!forceRefresh) {
    try {
      // 1. Instant SQLite read (<1ms) - only use if languages & config match
      const sqliteEntry = getExploreContentCacheEntrySync(genreFilterId);
      if (sqliteEntry?.data && isCompatibleCache(sqliteEntry.data)) {
        if (Date.now() - sqliteEntry.updatedAt >= EXPLORE_REFRESH_TTL_MS) {
          scheduleBackgroundExploreRefresh();
        }
        return sqliteEntry.data;
      }

      // 2. Fallback to AsyncStorage if SQLite is cold
      const saved = await AsyncStorage.getItem(cacheKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (isCompatibleCache(parsed)) {
          const cachedAt = typeof parsed._cachedAt === 'number' ? parsed._cachedAt : 0;
          saveExploreContentCacheSync(genreFilterId, parsed);
          if (!cachedAt || Date.now() - cachedAt >= EXPLORE_REFRESH_TTL_MS) {
            scheduleBackgroundExploreRefresh();
          }
          return parsed;
        }
      }
    } catch {}
  }

  return fetchFreshPersonalisedContent(
    languages,
    genreIds,
    favoriteActors,
    gId,
    cacheKey,
    configHash,
    genreFilterId,
    'high',
  );
};

const fetchFreshPersonalisedContent = async (
  languages: string[],
  genreIds: number[],
  favoriteActors: any[],
  gId: number | undefined,
  cacheKey: string,
  configHash: string,
  genreFilterId: number = 0,
  priority: RequestPriority = 'low',
) => {
  const existing = inFlightExploreRefreshes.get(cacheKey);
  if (existing) {
    if (priority === 'high') {
      existing.priority = 'high';
    }
    return existing.promise;
  }

  const refreshState: ActiveExploreRefresh = {
    promise: Promise.resolve(null),
    priority,
  };
  const startEpoch = cacheEpoch;

  const runPromise = (async () => {
    try {
      const getOpts = (): TmdbRequestOptions => ({ priority: refreshState.priority });
      const defaultWorldLangs = ['hi', 'ko', 'ja', 'fr', 'es'];
      const userLangs = (languages && languages.length > 0) ? languages : ['en'];
      // Include all user-selected languages from onboarding, and pad with default world languages if under 6
      const langSlice = Array.from(new Set([...userLangs, ...defaultWorldLangs.slice(0, Math.max(0, 6 - userLangs.length))]));
      const actorSlice = (favoriteActors || []).slice(0, 4);
      const genreSlice = (genreIds && genreIds.length > 0) ? genreIds.slice(0, 4) : [28, 35, 878];

      // Phase 1 (<=5 requests): fetch critical core shelves first so offline/unreachable
      // networks bail out in <=10s instead of queuing 27 doomed requests.
      const [coreTrending, coreTv, coreTopRated, coreUpcoming, coreLang0Movies] = await Promise.all([
        getTrendingMovies(1, gId, getOpts()),
        getTrendingTV(1, gId, getOpts()),
        getTopRated(1, gId, getOpts()),
        getUpcomingMovies(1, getOpts()),
        getLanguageMovies(langSlice[0], 1, gId, getOpts()),
      ]);

      const hasCoreContent =
        coreTrending.length > 0 ||
        coreTv.length > 0 ||
        coreTopRated.length > 0 ||
        coreLang0Movies.length > 0;

      if (!hasCoreContent) {
        return null;
      }

      // Phase 2: fetch remaining discovery shelves through the priority scheduler
      const remainingLangs = langSlice.slice(1);
      const [secondaryBase, lang0Tv, remainingLangResults, actorResults, genreResults] = await Promise.all([
        Promise.all([
          getHiddenGems(1, gId, getOpts()),
          getNostalgicMovies(1, gId, getOpts()),
          getAnimatedMovies(1, gId, getOpts()),
        ]),
        getLanguageTV(langSlice[0], 1, gId, getOpts()),
        Promise.all(
          remainingLangs.flatMap(lang => [
            getLanguageMovies(lang, 1, gId, getOpts()),
            getLanguageTV(lang, 1, gId, getOpts()),
          ])
        ),
        Promise.all(
          actorSlice.map(async (actor: any) => {
            try {
              const credits = await getPersonCombinedCredits(actor.id, getOpts());
              const topItems = credits
                .filter((item: any) => item.poster_path && (item.vote_count || 0) > 10)
                .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
                .slice(0, 15);
              return {
                actorId: actor.id,
                actorName: actor.name,
                profilePath: actor.profile_path,
                items: topItems,
              };
            } catch {
              return null;
            }
          })
        ),
        Promise.all(
          genreSlice.map(async (genreId: number) => {
            try {
              const movies = await getMoviesByGenre(genreId, 1, getOpts());
              return {
                genreId,
                items: movies.slice(0, 15),
              };
            } catch {
              return null;
            }
          })
        ),
      ]);

      const langData: Record<string, { movies: any[]; tv: any[] }> = {
        [langSlice[0]]: { movies: coreLang0Movies, tv: lang0Tv },
      };
      remainingLangs.forEach((lang, i) => {
        const movies = remainingLangResults[i * 2] ?? [];
        const tv = remainingLangResults[i * 2 + 1] ?? [];
        langData[lang] = { movies, tv };
      });

      const actorData = actorResults.filter(Boolean);
      const genreData = genreResults.filter(Boolean);

      const todayStr = new Date().toISOString().split('T')[0];
      const twoYearsAgoStr = `${new Date().getFullYear() - 2}-01-01`;

      // Filter strictly for currently released movies (no upcoming, unreleased, or future dates)
      const releasedTrending = coreTrending.filter((m: any) => {
        const relDate = m.release_date || '';
        return (
          relDate &&
          relDate <= todayStr &&
          relDate >= twoYearsAgoStr &&
          m.poster_path &&
          (m.vote_count || 0) >= 20
        );
      });
      const heroMovies = releasedTrending.length >= 5 
        ? releasedTrending.slice(0, 10) 
        : coreTrending.filter((m: any) => m.release_date && m.release_date <= todayStr && m.poster_path).slice(0, 10);

      let personalizedTrending = [...coreTrending];
      if (langSlice.length > 0) {
        const topLangMovies = langSlice.flatMap(l => (langData[l]?.movies || []).slice(0, 3));
        if (topLangMovies.length > 0) {
          const seen = new Set<number>();
          const merged: any[] = [];
          for (const m of [...coreTrending, ...topLangMovies]) {
            if (m && m.id && !seen.has(m.id)) {
              seen.add(m.id);
              merged.push(m);
            }
          }
          personalizedTrending = merged;
        }
      }

      const result = {
        heroMovies,
        trendingMovies: personalizedTrending,
        trendingTV: coreTv,
        upcoming: coreUpcoming,
        hiddenGems: secondaryBase[0],
        topRated: coreTopRated,
        nostalgia: secondaryBase[1],
        animatedMovies: secondaryBase[2],
        langData,
        actorData,
        genreData,
        _cachedAt: Date.now(),
        _configHash: configHash,
      };

      if (startEpoch === cacheEpoch) {
        saveExploreContentCacheSync(genreFilterId, result);
        AsyncStorage.setItem(cacheKey, JSON.stringify(result)).catch(() => {});
      }
      return result;
    } catch (error) {
      console.error('Error fetching personalised content:', error);
      return null;
    } finally {
      inFlightExploreRefreshes.delete(cacheKey);
    }
  })();

  refreshState.promise = runPromise;
  inFlightExploreRefreshes.set(cacheKey, refreshState);
  return runPromise;
};

export const fetchMoreContentByType = async (
  type: string,
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  if (type.startsWith('genre/')) { return await getMoviesByGenre(parseInt(type.split('/')[1]), page, options); }
  if (type.startsWith('similar/')) { const [mediaType, id] = type.split('/').slice(1); return await getSimilarMedia(parseInt(id), mediaType as "movie" | "tv", page, options); }
  if (type.startsWith('lang-movies-')) { return await getLanguageMovies(type.replace('lang-movies-', ''), page, undefined, options); }
  if (type.startsWith('lang-tv-')) { return await getLanguageTV(type.replace('lang-tv-', ''), page, undefined, options); }
  if (type === 'world-cinema' || type === 'lang' || type === 'lang-all') {
    const prefs = await getUserPreferences();
    const userLangs = (prefs.languages && prefs.languages.length > 0) ? prefs.languages : ['en', 'hi', 'ko'];
    const settled = await Promise.allSettled(
      userLangs.map((lang: string) => getLanguageMovies(lang, page, undefined, options))
    );
    const results: TMDBResult[][] = [];
    let firstError: any = null;
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value);
      else if (!firstError) firstError = s.reason;
    }
    if (results.length === 0 && firstError && options?.throwOnError) {
      throw firstError;
    }
    const combined: TMDBResult[] = [];
    const maxLen = Math.max(...results.map((r: TMDBResult[]) => r.length), 0);
    for (let i = 0; i < maxLen; i++) {
      for (const list of results) {
        if (list[i]) combined.push(list[i]);
      }
    }
    const seen = new Set<number>();
    return combined.filter((item) => {
      if (!item || !item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }
  if (type.startsWith('actor-')) {
    const actorId = parseInt(type.replace('actor-', ''));
    try {
      const credits = await getPersonCombinedCredits(actorId, options);
      return credits.filter((item: any) => item.poster_path);
    } catch (error) {
      if (options?.throwOnError) throw error;
      return [];
    }
  }
  if (type.startsWith('foryou-person-')) {
    const personId = parseInt(type.replace('foryou-person-', ''));
    try {
      const credits = await getPersonCombinedCredits(personId, options);
      return credits.filter((item: any) => item.poster_path);
    } catch (error) {
      if (options?.throwOnError) throw error;
      return [];
    }
  }
  if (type === 'foryou-saga-all') {
    try {
      const cached = getForYouCachedShelves();
      const sagaShelf = cached.find((s) => s.shelfId === 'saga-all');
      return sagaShelf?.items || [];
    } catch { return []; }
  }
  if (type.startsWith('foryou-saga-')) {
    const colId = parseInt(type.replace('foryou-saga-', ''));
    if (!isNaN(colId)) {
      try {
        const col = await getCollectionDetails(colId, options);
        return col?.parts || [];
      } catch (error) {
        if (options?.throwOnError) throw error;
        return [];
      }
    }
  }

  switch (type.toLowerCase()) {
    case 'trendingmovies': return await getTrendingMovies(page, undefined, options);
    case 'trendingtv': return await getTrendingTV(page, undefined, options);
    case 'toprated': return await getTopRated(page, undefined, options);
    case 'regional': return await getRegionalMovies('IN', page, undefined, options);
    case 'upcoming': return await getUpcomingMovies(page, options);
    case 'hiddengems': return await getHiddenGems(page, undefined, options);
    case 'nostalgia': return await getNostalgicMovies(page, undefined, options);
    case 'animatedmovies': return await getAnimatedMovies(page, undefined, options);
    default:
      if (type.startsWith('search:')) { return await searchTMDB(type.substring(7), page, options); }
      return await getTrendingMovies(page, undefined, options);
  }
};

export const getMoviesByGenre = async (
  genreId: number,
  page: number = 1,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  try {
    const data = await fetchWithCache("/discover/movie", { with_genres: genreId, sort_by: "popularity.desc", page }, options);
    return (data.results || []).map((item: any) => ({ ...formatBasicItemData(item), media_type: "movie" }));
  } catch (error) {
    if (options?.throwOnError) throw error;
    return [];
  }
};

// ==========================================
// 7. GEMINI AI RECOMMENDATIONS
// ==========================================

export const getGeminiRecommendations = async (userPrompt: string): Promise<TMDBResult[]> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'search',
      userPrompt: userPrompt,
      customApiKey: GLOBAL_CONFIG.customApiKey
    }, { timeout: AI_REQUEST_TIMEOUT_MS });
    
    if (!response.data.results || response.data.results.length === 0) return [];

    const moviePromises = response.data.results.map(async (item: any) => {
      const results = await searchTMDB(item.title);
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    return movies.filter((m): m is TMDBResult => m !== null);

  } catch (error: any) {
    console.error("AI Proxy Error:", error.message);
    return [];
  }
};

export const getGeminiMoviesSimilarTo = async (
  title: string,
  mediaType: 'movie' | 'tv' = 'movie',
  tmdbId: number,
  options?: TmdbRequestOptions,
): Promise<TMDBResult[]> => {
  const cacheKey = `${mediaType}-${tmdbId}`;
  const cached = aiCache.get(cacheKey);
  
  if (cached) {
      const isExpired = (Date.now() - cached.timestamp) > AI_CACHE_TTL_MS;
      if (!isExpired) {
        aiCache.delete(cacheKey);
        aiCache.set(cacheKey, cached);
        return cached.data;
      }
      aiCache.delete(cacheKey);
  }

  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'recommend',
      title: title,
      mediaType: mediaType,
      tmdbId: tmdbId,
      customApiKey: GLOBAL_CONFIG.customApiKey
    }, { timeout: AI_REQUEST_TIMEOUT_MS });
    
    if (!response.data.results || response.data.results.length === 0) return [];

    const moviePromises = response.data.results.map(async (item: any) => {
      const results = await searchTMDB(item.title, 1, { priority: options?.priority ?? 'high' });
      return results.find(m => m.poster_path) || null;
    });

    const movies = await Promise.all(moviePromises);
    const validMovies = movies.filter((m): m is TMDBResult => m !== null);

    if (aiCache.has(cacheKey)) {
      aiCache.delete(cacheKey);
    } else if (aiCache.size >= MAX_AI_CACHE_ENTRIES) {
      const oldestKey = aiCache.keys().next().value;
      if (oldestKey) aiCache.delete(oldestKey);
    }
    aiCache.set(cacheKey, { data: validMovies, timestamp: Date.now() });
    return validMovies;

  } catch (error: any) {
    console.error("AI Proxy Error:", error.message);
    if (options?.throwOnError) throw error;
    return [];
  }
};

export const cleanTitleAndExtractYear = (rawTitle: string): { cleanTitle: string; year?: string } => {
  if (!rawTitle || typeof rawTitle !== 'string') return { cleanTitle: '' };

  // 1. Remove leading list numbering / bullets: "1. ", "1) ", "- ", "• "
  let cleaned = rawTitle.replace(/^[\d]+[\.\)]\s*/, '').replace(/^[-•*]\s*/, '').trim();

  // 2. Remove markdown formatting asterisks, underscores, backticks
  cleaned = cleaned.replace(/[*_`]/g, '').trim();

  // 3. Extract 4-digit year in parentheses or brackets: "(2016)", "[2010]", etc.
  let year: string | undefined;
  const yearMatch = cleaned.match(/[\(\[]\s*(\b\d{4}\b)\s*[\)\]]/);
  if (yearMatch) {
    year = yearMatch[1];
    cleaned = cleaned.replace(/[\(\[]\s*\b\d{4}\b\s*[\)\]]/, '').trim();
  }

  // 4. Strip surrounding quotation marks
  cleaned = cleaned.replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();

  // 5. Strip trailing punctuation
  cleaned = cleaned.replace(/[-–—:]\s*$/, '').trim();

  return { cleanTitle: cleaned || rawTitle.trim(), year };
};

export const resolveMovieFromTitle = async (rawTitle: string): Promise<TMDBResult | null> => {
  if (!rawTitle || typeof rawTitle !== 'string') return null;
  const { cleanTitle, year } = cleanTitleAndExtractYear(rawTitle);

  try {
    // 1. Primary search with cleaned title
    let results = await searchTMDB(cleanTitle);

    // 2. Fallback to rawTitle if cleaned returned empty and differed
    if ((!results || results.length === 0) && cleanTitle !== rawTitle.trim()) {
      results = await searchTMDB(rawTitle.trim());
    }

    // 3. Subtitle / colon split fallback (e.g. "Kubo: Two Strings" -> "Kubo")
    if ((!results || results.length === 0) && (cleanTitle.includes(':') || cleanTitle.includes(' - '))) {
      const primaryPart = cleanTitle.split(/[:\-]/)[0].trim();
      if (primaryPart.length > 2) {
        results = await searchTMDB(primaryPart);
      }
    }

    if (!results || results.length === 0) return null;

    // Filter to media items (movies or TV, avoiding person results)
    const mediaResults = results.filter((m) => m && m.id && (m.media_type === 'movie' || m.media_type === 'tv' || m.poster_path));
    const candidateList = mediaResults.length > 0 ? mediaResults : results;

    // If year was extracted, prioritize exact year match with a poster
    if (year) {
      const yearMatch = candidateList.find((m) => {
        const releaseYear = (m.release_date || m.first_air_date || '').slice(0, 4);
        return releaseYear === year;
      });
      if (yearMatch && (yearMatch.poster_path || yearMatch.backdrop_path)) {
        return yearMatch;
      }
      if (yearMatch) {
        return yearMatch;
      }
    }

    // Return the best match with a poster, or first candidate
    return candidateList.find((m) => m.poster_path) || candidateList[0] || null;
  } catch (err) {
    return null;
  }
};

export const fetchChatGemini = async (
  message: string,
  history: any[] = [],
  userMemory: string = '',
  watchedTitles: string[] = [],
  watchlistTitles: string[] = [],
  watchlistCollections: string[] = [],
  userPreferences: any = null,
  timezone?: string
): Promise<any> => {
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'chat',
      message,
      history,
      userMemory,
      watchedTitles: Array.isArray(watchedTitles) ? watchedTitles.slice(0, 50) : [],
      watchlistTitles: Array.isArray(watchlistTitles) ? watchlistTitles.slice(0, 50) : [],
      watchlistCollections: Array.isArray(watchlistCollections) ? watchlistCollections.slice(0, 20) : [],
      userPreferences,
      timezone: tz,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    }, { timeout: AI_REQUEST_TIMEOUT_MS });

    let reply = response.data?.reply || { kind: 'text', text: "I'm not sure how to answer that." };

    if (typeof reply === 'string') {
      try { reply = JSON.parse(reply); } catch {}
    }

    if (reply?.kind === 'text' && typeof reply.text === 'string' && reply.text.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(reply.text.trim());
        if (parsed && typeof parsed === 'object' && parsed.kind) {
          reply = parsed;
        }
      } catch {
        const match = reply.text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed && typeof parsed === 'object' && parsed.kind) {
              reply = parsed;
            }
          } catch {}
        }
      }
    }

    if (reply.kind === 'movies' && Array.isArray(reply.titles) && reply.titles.length > 0) {
      const moviePromises = reply.titles.map(async (t: string) => {
        const { cleanTitle } = cleanTitleAndExtractYear(t);
        const existing = (reply.movies || []).find(
          (m: any) =>
            m &&
            m.id &&
            m.poster_path &&
            (m.title?.toLowerCase() === cleanTitle.toLowerCase() ||
              m.name?.toLowerCase() === cleanTitle.toLowerCase() ||
              m.title?.toLowerCase() === t.toLowerCase())
        );
        if (existing) return existing;

        return await resolveMovieFromTitle(t);
      });
      const resolvedMovies = await Promise.all(moviePromises);
      reply.movies = resolvedMovies.filter(Boolean);
    }

    if (reply.kind === 'actors' && Array.isArray(reply.names) && reply.names.length > 0) {
      const actorPromises = reply.names.map(async (n: string) => {
        try {
          const cleanName = n.replace(/^[\d]+[\.\)]\s*/, '').replace(/[*_`]/g, '').trim();
          const results = await searchPeople(cleanName, 1);
          return results[0] || null;
        } catch {
          return null;
        }
      });
      const resolvedActors = await Promise.all(actorPromises);
      reply.actors = resolvedActors.filter(Boolean);
    }

    if (reply.kind === 'movie_detail' && reply.title) {
      try {
        reply.movie = await resolveMovieFromTitle(reply.title);
      } catch {
        reply.movie = null;
      }
    }

    return reply;
  } catch (error: any) {
    console.error('fetchChatGemini error:', error.message);
    throw error;
  }
};

export const updateUserMemoryWithAi = async (existingMemory: string, userMessage: string): Promise<string> => {
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/gemini', {
      action: 'update_memory',
      existingMemory,
      userMessage,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    }, { timeout: AI_REQUEST_TIMEOUT_MS });
    return response.data?.memory || existingMemory;
  } catch (e) {
    return existingMemory;
  }
};

export const fetchEmbedding = async (text: string): Promise<number[] | null> => {
  if (!GLOBAL_CONFIG.aiEnabled) return null;
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/embed', {
      text,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    }, { timeout: AI_REQUEST_TIMEOUT_MS });
    return response.data?.embedding || null;
  } catch (error: any) {
    console.warn('fetchEmbedding error:', error.message);
    return null;
  }
};

export const fetchEmbeddingsBatch = async (texts: string[]): Promise<number[][] | null> => {
  if (!GLOBAL_CONFIG.aiEnabled) return null;
  try {
    const response = await axios.post('https://watcher-api-rho.vercel.app/api/embed', {
      texts,
      customApiKey: GLOBAL_CONFIG.customApiKey,
    }, { timeout: AI_REQUEST_TIMEOUT_MS });
    return response.data?.embeddings || null;
  } catch (error: any) {
    console.warn('fetchEmbeddingsBatch error:', error.message);
    return null;
  }
};
