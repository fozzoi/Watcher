/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, beforeEach, test, expect, jest } from '@jest/globals';

type TmdbCacheEntry = { data: any; updatedAt: number };

const mockPersistentTmdbCache = new Map<string, TmdbCacheEntry>();
const mockExploreCache = new Map<number, TmdbCacheEntry>();
const mockAsyncStorageMap = new Map<string, string>();

const mockAxiosGet = jest.fn<(...args: any[]) => Promise<any>>();
const mockAxiosPost = jest.fn<(...args: any[]) => Promise<any>>();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({
      get: (...args: any[]) => mockAxiosGet(...args),
      interceptors: { response: { use: jest.fn() } },
    })),
    post: (...args: any[]) => mockAxiosPost(...args),
  },
}));

jest.mock('@react-native-community/netinfo');

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsyncStorageMap.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockAsyncStorageMap.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockAsyncStorageMap.delete(k);
    }),
  },
}));

jest.mock('../userPreferences', () => ({
  getUserPreferences: jest.fn(async () => ({
    languages: ['en'],
    genreIds: [28],
    favoriteActors: [],
  })),
}));

jest.mock('../database', () => ({
  getForYouCachedShelves: jest.fn(() => []),
  getExploreContentCacheEntrySync: jest.fn((genreId: number = 0) => mockExploreCache.get(genreId) ?? null),
  saveExploreContentCacheSync: jest.fn((genreId: number, data: any) => {
    mockExploreCache.set(genreId, { data, updatedAt: Date.now() });
  }),
  clearExploreCache: jest.fn(() => {
    mockExploreCache.clear();
  }),
  getTmdbResponseCacheSync: jest.fn((cacheKey: string) => mockPersistentTmdbCache.get(cacheKey) ?? null),
  saveTmdbResponseCacheSync: jest.fn((cacheKey: string, data: any) => {
    mockPersistentTmdbCache.set(cacheKey, { data, updatedAt: Date.now() });
  }),
  clearTmdbResponseCacheSync: jest.fn((prefix: string = '') => {
    if (!prefix) {
      mockPersistentTmdbCache.clear();
      return;
    }
    for (const k of Array.from(mockPersistentTmdbCache.keys())) {
      if (k.startsWith(prefix)) mockPersistentTmdbCache.delete(k);
    }
  }),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Native fetch adds one async hop per request compared with the old axios path,
// so allow more microtask turns before asserting.
const flushMicrotasks = async (cycles = 30) => {
  for (let i = 0; i < cycles; i++) {
    await Promise.resolve();
  }
};

const parseFetchUrl = (url: string) => {
  const queryIndex = url.indexOf('?');
  const rawPath = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const path = rawPath.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api\/tmdb/, '') || '/';
  const params: Record<string, unknown> = {};
  if (queryIndex !== -1) {
    for (const pair of url.slice(queryIndex + 1).split('&')) {
      if (!pair) continue;
      const [rawKey, rawValue = ''] = pair.split('=');
      const key = decodeURIComponent(rawKey);
      const value = decodeURIComponent(rawValue);
      params[key] = /^-?\d+$/.test(value) ? Number(value) : value === 'true' ? true : value === 'false' ? false : value;
    }
  }
  return { path, params };
};

// The client moved from axios to native fetch, but these tests still drive it
// through axios-style mocks. Bridge the two so assertions keep their shape.
const installFetchMock = () => {
  (globalThis as any).fetch = jest.fn(async (url: string) => {
    const { path, params } = parseFetchUrl(String(url));
    const response: any = await mockAxiosGet(path, { params });
    const body = response && typeof response === 'object' && 'data' in response ? response.data : response;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body ?? null),
    };
  });
};

describe('TMDB caching, priority queue, and error handling', () => {
  beforeEach(() => {
    mockPersistentTmdbCache.clear();
    mockExploreCache.clear();
    mockAsyncStorageMap.clear();
    mockAxiosGet.mockReset();
    mockAxiosPost.mockReset();
    jest.restoreAllMocks();
    jest.resetModules();
    installFetchMock();
  });

  test('limits concurrent low-priority requests while allowing high-priority requests to preempt immediately', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const startedOrder: string[] = [];
    const deferredByUrl = new Map<string, ReturnType<typeof deferred<any>>>();

    mockAxiosGet.mockImplementation((endpoint: string) => {
      startedOrder.push(endpoint);
      const d = deferred<any>();
      deferredByUrl.set(endpoint, d);
      return d.promise;
    });

    const low1 = tmdb.getPersonImages(1, { priority: 'low' });
    const low2 = tmdb.getPersonImages(2, { priority: 'low' });
    const low3 = tmdb.getPersonImages(3, { priority: 'low' });
    const low4 = tmdb.getPersonImages(4, { priority: 'low' });

    await flushMicrotasks();

    // MAX_CONCURRENT_LOW is 3, so person 4 stays queued
    expect(startedOrder).toEqual(['/person/1/images', '/person/2/images', '/person/3/images']);

    // High-priority foreground tap must bypass lowQueue and start immediately (slot 4 of 6)
    const highTap = tmdb.getPersonImages(99, { priority: 'high' });
    await flushMicrotasks();

    expect(startedOrder).toEqual([
      '/person/1/images',
      '/person/2/images',
      '/person/3/images',
      '/person/99/images',
    ]);

    for (const [ep, d] of deferredByUrl.entries()) {
      if (ep === '/person/99/images') {
        d.resolve({ data: { profiles: [{ file_path: '/p99.jpg', aspect_ratio: 0.66, width: 100, height: 150 }] } });
      } else {
        d.resolve({ data: { profiles: [] } });
      }
    }
    await flushMicrotasks();
    // Person 4 starts once low slots free up
    deferredByUrl.get('/person/4/images')?.resolve({ data: { profiles: [] } });

    const [r99, r1, r2, r3, r4] = await Promise.all([highTap, low1, low2, low3, low4]);
    expect(r99).toHaveLength(1);
    expect([r1, r2, r3, r4]).toEqual([[], [], [], []]);
  });

  test('cancelling one subscriber does not abort a shared request still used by another screen', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const pending = deferred<any>();
    mockAxiosGet.mockReturnValue(pending.promise);
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = tmdb.getPersonDetails(555, { signal: firstController.signal });
    const second = tmdb.getPersonDetails(555, { signal: secondController.signal });

    await flushMicrotasks();
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });

    pending.resolve({ data: { id: 555, name: 'Person' } });
    await expect(second).resolves.toMatchObject({ id: 555, name: 'Person' });
  });

  test('cancelling the last subscriber aborts the active request and frees its queue slot', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const pending = deferred<any>();
    mockAxiosGet.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
      data: { id: 556, name: 'Next person' },
    });
    const controller = new AbortController();
    const cancelled = tmdb.getPersonDetails(555, { signal: controller.signal });

    await flushMicrotasks();
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });

    const next = tmdb.getPersonDetails(556);
    await expect(next).resolves.toMatchObject({ id: 556, name: 'Next person' });
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
    pending.resolve({ data: { id: 555, name: 'Cancelled person' } });
  });

  test('cancelling a queued screen request removes it before dispatch', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const pendingByEndpoint = new Map<string, ReturnType<typeof deferred<any>>>();
    mockAxiosGet.mockImplementation((endpoint: string) => {
      const pending = deferred<any>();
      pendingByEndpoint.set(endpoint, pending);
      return pending.promise;
    });

    const activeRequests = Array.from({ length: 6 }, (_, index) => tmdb.getPersonDetails(index + 1));
    await flushMicrotasks();
    expect(mockAxiosGet).toHaveBeenCalledTimes(6);

    const controller = new AbortController();
    const queuedRequest = tmdb.getPersonDetails(99, { signal: controller.signal });
    await flushMicrotasks();
    expect(mockAxiosGet).toHaveBeenCalledTimes(6);

    controller.abort();
    await expect(queuedRequest).rejects.toMatchObject({ name: 'AbortError' });

    for (const [endpoint, pending] of pendingByEndpoint) {
      pending.resolve({ data: { id: Number(endpoint.split('/').pop()), name: 'Person' } });
    }
    await Promise.all(activeRequests);
    await flushMicrotasks();
    expect(mockAxiosGet).toHaveBeenCalledTimes(6);
  });

  test('serves persistent stale cache immediately via SWR and invokes onBackgroundUpdate only when payload changes', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const cacheKey = '/tv/37680/season/1-{"include_adult":false}';
    const initialEpisodes = [{ id: 1, name: 'Pilot', episode_number: 1, season_number: 1 }];
    // 6 hours old (> 4h CACHE_TTL_MS, < 7d PERSISTENT_STALE_TTL_MS)
    mockPersistentTmdbCache.set(cacheKey, {
      data: { episodes: initialEpisodes },
      updatedAt: now - 1000 * 60 * 60 * 6,
    });

    const bgDeferred = deferred<any>();
    mockAxiosGet.mockReturnValueOnce(bgDeferred.promise);

    const onBackgroundUpdate = jest.fn();
    const firstResult = await tmdb.getSeasonEpisodes(37680, 1, {
      priority: 'high',
      onBackgroundUpdate,
    });

    // Returns cached data immediately without waiting for network
    expect(firstResult).toEqual(initialEpisodes);
    await flushMicrotasks();
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);

    // Identical payload from background revalidation should NOT fire callback
    bgDeferred.resolve({ data: { episodes: initialEpisodes } });
    await flushMicrotasks();
    expect(onBackgroundUpdate).not.toHaveBeenCalled();

    // Force stale again & verify changed payload triggers callback + updates cache
    const updatedEpisodes = [
      ...initialEpisodes,
      { id: 2, name: 'Errors and Omissions', episode_number: 2, season_number: 1 },
    ];
    mockPersistentTmdbCache.set(cacheKey, {
      data: { episodes: initialEpisodes },
      updatedAt: now - 1000 * 60 * 60 * 6,
    });
    // Force cacheKey out of memory by clearing memory cache prefix and re-hydrating stale SQLite row
    tmdb.clearCache('/tv/37680/season/1');
    mockPersistentTmdbCache.set(cacheKey, {
      data: { episodes: initialEpisodes },
      updatedAt: now - 1000 * 60 * 60 * 6,
    });

    mockAxiosGet.mockResolvedValueOnce({ data: { episodes: updatedEpisodes } });
    const onChangedUpdate = jest.fn();
    const secondResult = await tmdb.getSeasonEpisodes(37680, 1, {
      priority: 'high',
      onBackgroundUpdate: onChangedUpdate,
    });

    expect(secondResult).toEqual(initialEpisodes);
    await flushMicrotasks(12);
    expect(onChangedUpdate).toHaveBeenCalledWith(updatedEpisodes);
  });

  test('getMediaDetails makes one timed-out request and never falls back to /movie or retries a 503', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const timeoutErr: any = new Error('timeout of 10000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    mockAxiosGet.mockRejectedValue(timeoutErr);

    await expect(tmdb.getMediaDetails(37680, 'tv', 'US', { priority: 'high' })).rejects.toThrow('timeout');

    expect(mockAxiosGet.mock.calls.map((c) => c[0])).toEqual(['/tv/37680']);

    mockAxiosGet.mockReset();
    const err503: any = new Error('Service Unavailable');
    err503.response = { status: 503 };
    mockAxiosGet.mockRejectedValue(err503);

    await expect(tmdb.getMediaDetails(37680, 'tv', 'US', { priority: 'high' })).rejects.toThrow('Service Unavailable');
    expect(mockAxiosGet.mock.calls.map((c) => c[0])).toEqual(['/tv/37680']);
  });

  test('getMediaDetails DOES fall back to opposite media_type on 404 and populates directors', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const notFoundErr: any = new Error('Not Found');
    notFoundErr.response = { status: 404, data: { status_code: 34 } };

    mockAxiosGet.mockRejectedValueOnce(notFoundErr).mockResolvedValueOnce({
      data: {
        id: 37680,
        name: 'Suits',
        overview: 'Legal drama',
        poster_path: '/suits.jpg',
        vote_average: 8.2,
        first_air_date: '2011-06-23',
        credits: {
          cast: [{ id: 10, name: 'Gabriel Macht', profile_path: null, character: 'Harvey Specter' }],
          crew: [
            { id: 20, name: 'Aaron Korsh', job: 'Executive Producer', profile_path: null },
            { id: 21, name: 'Kevin Bray', job: 'Director', profile_path: '/dir.jpg' },
          ],
        },
        seasons: [{ id: 1, name: 'Season 1', season_number: 1, episode_count: 12, poster_path: null, overview: '', air_date: null }],
      },
    });

    const details = await tmdb.getMediaDetails(37680, 'movie', 'US', { priority: 'high' });
    expect(mockAxiosGet.mock.calls.map((c) => c[0])).toEqual(['/movie/37680', '/tv/37680']);
    expect(mockAxiosGet.mock.calls[0][1].params.append_to_response).toBe(
      'credits,release_dates,content_ratings,external_ids,videos',
    );
    expect(details.media_type).toBe('tv');
    expect(details.director?.name).toBe('Kevin Bray');
    expect(details.directors).toHaveLength(1);
    expect(details.recommendations).toEqual([]);
    expect(details.images).toEqual([]);
  });

  test('getPersonBundle fetches the whole cast page in a single request', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    mockAxiosGet.mockResolvedValueOnce({
      data: {
        id: 287,
        name: 'Brad Pitt',
        profile_path: '/bp.jpg',
        combined_credits: {
          cast: [
            { id: 550, title: 'Fight Club', media_type: 'movie', popularity: 30 },
            { id: 1399, name: 'Late Night Talk', media_type: 'tv', genre_ids: [10767] },
          ],
          crew: [{ id: 807, title: 'Se7en', media_type: 'movie', job: 'Director' }],
        },
        images: { profiles: [{ file_path: '/p1.jpg', aspect_ratio: 0.67, width: 100, height: 150 }] },
      },
    });

    const bundle = await tmdb.getPersonBundle(287, { priority: 'high' });

    // Exactly one round trip, with the appended blocks requested together.
    expect(mockAxiosGet.mock.calls.map((c) => c[0])).toEqual(['/person/287']);
    expect(mockAxiosGet).toHaveBeenCalledWith('/person/287', {
      params: expect.objectContaining({ append_to_response: 'combined_credits,images' }),
    });

    // Profile state stays clean; the appended blobs are unpacked separately.
    expect(bundle.person).toMatchObject({ id: 287, name: 'Brad Pitt' });
    expect((bundle.person as any).combined_credits).toBeUndefined();
    expect((bundle.person as any).images).toBeUndefined();

    // Talk shows filtered out, director credit kept.
    expect(bundle.credits.map((credit: any) => credit.id).sort()).toEqual([550, 807]);
    expect(bundle.images).toHaveLength(1);
  });

  test('an Explore refresh that loses its audience stops after the core shelves', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');
    const db = require('../database');

    // A compatible page is already on screen, so dropping the tail is allowed.
    mockExploreCache.set(0, {
      data: { langData: { en: { movies: [], tv: [] } }, _configHash: 'nsfw:1|genres:28|actors:' },
      updatedAt: Date.now(),
    });

    mockAxiosGet.mockResolvedValue({
      data: { results: [{ id: 1, title: 'A', poster_path: '/a.jpg' }] },
    });

    const result = await tmdb.fetchPersonalisedDiscoveryContent(
      ['en'],
      [28],
      0,
      true,
      [],
      undefined,
      () => false, // user already left the tab
    );

    expect(result).toBeNull();
    // Phase 1 is 5 requests; the ~21 Phase 2 requests never fire.
    expect(mockAxiosGet.mock.calls.length).toBe(5);
    // The abandoned partial page must not be cached as if it were complete.
    expect(db.saveExploreContentCacheSync).not.toHaveBeenCalled();
  });

  test('fails fast without a network attempt when the device reports offline', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');
    const netinfo = require('@react-native-community/netinfo');

    mockAxiosGet.mockRejectedValue(new Error('network should not be touched'));

    netinfo.__setState({ isConnected: false, isInternetReachable: false });

    await expect(
      tmdb.getMediaDetails(37680, 'tv', 'US', { priority: 'high' })
    ).rejects.toMatchObject({ code: 'ERR_OFFLINE' });

    // The whole point: no request is attempted, so no 15s timeout is paid.
    expect(mockAxiosGet).not.toHaveBeenCalled();
  });

  test('getSeasonEpisodes throws when offline with no cache instead of returning empty episodes', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const networkErr: any = new Error('Network Error');
    mockAxiosGet.mockRejectedValue(networkErr);

    await expect(tmdb.getSeasonEpisodes(37680, 3, { priority: 'high' })).rejects.toThrow('Network Error');
  });

  test('getSimilarForHistory passes (id, mediaType) in correct order to recommendations endpoint', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    mockAxiosGet.mockResolvedValueOnce({
      data: {
        results: [{ id: 999, name: 'White Collar', poster_path: '/wc.jpg', vote_average: 8.0 }],
      },
    });

    const shelves = await tmdb.getSimilarForHistory([
      { id: 37680, media_type: 'tv', name: 'Suits' },
    ]);

    expect(mockAxiosGet).toHaveBeenCalledWith(
      '/tv/37680/recommendations',
      expect.objectContaining({ params: expect.objectContaining({ page: 1 }) }),
    );
    expect(shelves).toHaveLength(1);
    expect(shelves[0].sourceTitle).toBe('Suits');
  });

  test('fetchPersonalisedDiscoveryContent skips network when Explore cache <30m and preserves cache when offline', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const cachedFeed = {
      heroMovies: [{ id: 1, title: 'Hero' }],
      trendingMovies: [{ id: 1, title: 'Hero' }],
      langData: { en: { movies: [{ id: 2 }], tv: [] } },
    };

    // Fresh cache (5 mins ago): should not hit network at all
    mockExploreCache.set(0, { data: cachedFeed, updatedAt: now - 5 * 60 * 1000 });
    const freshRes = await tmdb.fetchPersonalisedDiscoveryContent(['en'], [28], 0, false, []);
    expect(freshRes).toEqual(cachedFeed);
    expect(mockAxiosGet).not.toHaveBeenCalled();

    // Stale cache (45 mins ago) while offline: returns stale cache immediately,
    // attempts background refresh, and NEVER overwrites exploreCache with empty arrays
    mockExploreCache.set(0, { data: cachedFeed, updatedAt: now - 45 * 60 * 1000 });
    mockAxiosGet.mockRejectedValue(new Error('Offline'));
    const onBgUpdate = jest.fn();

    const staleRes = await tmdb.fetchPersonalisedDiscoveryContent(['en'], [28], 0, false, [], onBgUpdate);
    expect(staleRes).toEqual(cachedFeed);

    await new Promise((res) => setTimeout(res, 750));
    await flushMicrotasks(20);
    expect(mockAxiosGet).toHaveBeenCalled();
    expect(onBgUpdate).not.toHaveBeenCalled();
    expect(mockExploreCache.get(0)?.data).toEqual(cachedFeed);
  });

  test('setGlobalConfig preserves caches on hiRes toggle and clears both memory & SQLite on nsfwFilterEnabled change', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    mockAxiosGet.mockResolvedValue({ data: { profiles: [{ file_path: '/a.jpg', aspect_ratio: 1, width: 10, height: 10 }] } });
    await tmdb.getPersonImages(7);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPersistentTmdbCache.size).toBe(1);

    // Changing hiRes must keep cache intact
    tmdb.setGlobalConfig('hiRes', true);
    await tmdb.getPersonImages(7);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);
    expect(mockPersistentTmdbCache.size).toBe(1);

    // Toggling nsfwFilterEnabled clears memory, persistent, and Explore caches
    mockExploreCache.set(0, { data: { trendingMovies: [{ id: 1 }] }, updatedAt: Date.now() });
    tmdb.setGlobalConfig('nsfwFilterEnabled', false);
    expect(mockPersistentTmdbCache.size).toBe(0);
    expect(mockExploreCache.size).toBe(0);
    await tmdb.getPersonImages(7);
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);
  });

  test('promotes a queued low-priority request ahead of remaining lowQueue items when 6 slots (3 high + 3 low) are full', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const startedOrder: string[] = [];
    const deferredByEndpoint = new Map<string, ReturnType<typeof deferred<any>>>();

    mockAxiosGet.mockImplementation((endpoint: string) => {
      startedOrder.push(endpoint);
      const d = deferred<any>();
      deferredByEndpoint.set(endpoint, d);
      return d.promise;
    });

    // Saturate 3 high + 3 low active slots, plus low4 & low5 waiting in lowQueue
    const h1 = tmdb.getPersonImages(101, { priority: 'high' });
    const h2 = tmdb.getPersonImages(102, { priority: 'high' });
    const h3 = tmdb.getPersonImages(103, { priority: 'high' });
    const l1 = tmdb.getPersonImages(201, { priority: 'low' });
    const l2 = tmdb.getPersonImages(202, { priority: 'low' });
    const l3 = tmdb.getPersonImages(203, { priority: 'low' });
    const l4 = tmdb.getPersonImages(204, { priority: 'low' });
    const l5 = tmdb.getPersonImages(205, { priority: 'low' });

    await flushMicrotasks();
    expect(startedOrder).toHaveLength(6);

    // Promote person 205 (l5, sitting behind l4 in lowQueue) via a high-priority caller
    const promoted = tmdb.getPersonImages(205, { priority: 'high' });
    await flushMicrotasks();

    // Free one high slot -> promoted 205 must dispatch BEFORE queued 204 (l4)
    deferredByEndpoint.get('/person/101/images')?.resolve({ data: { profiles: [] } });
    await flushMicrotasks(12);
    expect(startedOrder[6]).toBe('/person/205/images');

    // Resolve all remaining tasks
    for (const d of deferredByEndpoint.values()) {
      d.resolve({ data: { profiles: [] } });
    }
    await flushMicrotasks(12);
    deferredByEndpoint.get('/person/204/images')?.resolve({ data: { profiles: [] } });

    await Promise.all([h1, h2, h3, l1, l2, l3, l4, l5, promoted]);
  });

  test('enforces MAX_REQUEST_CACHE_ENTRIES (300) true LRU eviction', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    mockAxiosGet.mockImplementation(async (endpoint: string) => ({
      data: { profiles: [{ file_path: endpoint, aspect_ratio: 1, width: 10, height: 10 }] },
    }));

    // Fill 300 entries using non-persisted /discover/movie?page=N so only memory LRU is tested
    for (let i = 1; i <= 300; i++) {
      await tmdb.discoverMovies({ with_genres: 28 }, i);
    }
    expect(mockAxiosGet).toHaveBeenCalledTimes(300);

    // Access page 1 -> promotes it to MRU (zero new network call)
    await tmdb.discoverMovies({ with_genres: 28 }, 1);
    expect(mockAxiosGet).toHaveBeenCalledTimes(300);

    // Add page 301 -> evicts LRU page 2, keeps page 1
    await tmdb.discoverMovies({ with_genres: 28 }, 301);
    expect(mockAxiosGet).toHaveBeenCalledTimes(301);

    // Page 1 must still be a memory hit; page 2 must re-fetch
    await tmdb.discoverMovies({ with_genres: 28 }, 1);
    expect(mockAxiosGet).toHaveBeenCalledTimes(301);
    await tmdb.discoverMovies({ with_genres: 28 }, 2);
    expect(mockAxiosGet).toHaveBeenCalledTimes(302);
  });

  test('SWR attaches onBackgroundUpdate to active forceRefresh and ignores stale pre-clearCache writes', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');
    const now = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const cacheKey = '/tv/37680/season/2-{"include_adult":false}';
    mockPersistentTmdbCache.set(cacheKey, {
      data: { episodes: [{ id: 1, name: 'Old', episode_number: 1, season_number: 2 }] },
      updatedAt: now - 1000 * 60 * 60 * 6,
    });

    const forceDeferred = deferred<any>();
    mockAxiosGet.mockReturnValueOnce(forceDeferred.promise);

    // 1. Start forceRefresh
    const forcePromise = tmdb.getSeasonEpisodes(37680, 2, { priority: 'high', forceRefresh: true });
    await flushMicrotasks();

    // 2. While in-flight, SWR caller attaches onBackgroundUpdate
    const onBg = jest.fn();
    const staleRes = await tmdb.getSeasonEpisodes(37680, 2, { priority: 'high', onBackgroundUpdate: onBg });
    expect(staleRes[0].name).toBe('Old');

    forceDeferred.resolve({ data: { episodes: [{ id: 1, name: 'Updated', episode_number: 1, season_number: 2 }] } });
    await forcePromise;
    await flushMicrotasks(10);
    expect(onBg).toHaveBeenCalledWith([{ id: 1, name: 'Updated', episode_number: 1, season_number: 2 }]);

    // 3. Pre-clearCache response must NOT repopulate cache after clearCache()
    const slowDeferred = deferred<any>();
    mockAxiosGet.mockReturnValueOnce(slowDeferred.promise);
    const pendingReq = tmdb.getSeasonEpisodes(37680, 4, { priority: 'high' });
    await flushMicrotasks();
    tmdb.clearCache();
    slowDeferred.resolve({ data: { episodes: [{ id: 9, name: 'StaleEpoch', episode_number: 1, season_number: 4 }] } });
    await pendingReq;
    expect(mockPersistentTmdbCache.size).toBe(0);
  });

  test('fetchPersonalisedDiscoveryContent bails out after core requests when offline and invalidates on configHash change', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');

    const timeoutErr: any = new Error('timeout of 10000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    mockAxiosGet.mockRejectedValue(timeoutErr);

    // Cold cache + offline: only the 5 core requests run instead of 25+.
    const res = await tmdb.fetchPersonalisedDiscoveryContent(['en'], [28], 28, false, []);
    expect(res).toBeNull();
    expect(mockAxiosGet).toHaveBeenCalledTimes(5);

    // _configHash mismatch invalidates stale Explore cache
    mockExploreCache.set(0, {
      data: {
        heroMovies: [],
        trendingMovies: [{ id: 1 }],
        langData: { en: { movies: [{ id: 1 }], tv: [] } },
        _configHash: 'nsfw:1|genres:99|actors:',
      },
      updatedAt: Date.now(),
    });
    mockAxiosGet.mockReset();
    mockAxiosGet.mockResolvedValue({ data: { results: [{ id: 5, title: 'Fresh', release_date: '2024-01-01', poster_path: '/f.jpg', vote_count: 50, vote_average: 7.5 }] } });

    const refreshed = await tmdb.fetchPersonalisedDiscoveryContent(['en'], [28], 0, false, []);
    expect(refreshed?.trendingMovies[0].id).toBe(5);
    expect(mockAxiosGet).toHaveBeenCalled();
  });

  test('getGeminiMoviesSimilarTo propagates error when throwOnError is true', async () => {
    const tmdb = require('../tmdb') as typeof import('../tmdb');
    const timeoutErr: any = new Error('timeout of 25000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    mockAxiosPost.mockRejectedValueOnce(timeoutErr);

    await expect(
      tmdb.getGeminiMoviesSimilarTo('Suits', 'tv', 37680, { throwOnError: true }),
    ).rejects.toThrow('timeout');
  });
});
