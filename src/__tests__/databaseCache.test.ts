/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, beforeEach, test, expect, jest } from '@jest/globals';

type SqlRow = { data_json: string; updated_at: number };

const mockTmdbRows = new Map<string, SqlRow>();
const mockExploreRows = new Map<number, SqlRow>();

const mockDb = {
  execSync: jest.fn((sql: string) => {
    void sql;
  }),
  runSync: jest.fn((sql: string, params: any[] = []) => {
    if (sql.includes('INSERT OR REPLACE INTO explore_content_cache')) {
      const [genreId, dataJson, updatedAt] = params;
      mockExploreRows.set(Number(genreId), { data_json: dataJson, updated_at: Number(updatedAt) });
    } else if (sql.includes('DELETE FROM explore_content_cache')) {
      mockExploreRows.clear();
    } else if (sql.includes('INSERT OR REPLACE INTO tmdb_response_cache')) {
      const [cacheKey, dataJson, updatedAt] = params;
      mockTmdbRows.set(String(cacheKey), { data_json: dataJson, updated_at: Number(updatedAt) });
    } else if (sql.includes('DELETE FROM tmdb_response_cache WHERE cache_key = ?')) {
      mockTmdbRows.delete(String(params[0]));
    } else if (sql.includes('DELETE FROM tmdb_response_cache WHERE cache_key LIKE ?')) {
      const pattern = String(params[0] || '');
      const prefix = pattern.endsWith('%') ? pattern.slice(0, -1).replace(/\\([%_\\])/g, '$1') : pattern;
      for (const k of Array.from(mockTmdbRows.keys())) {
        if (k.startsWith(prefix)) mockTmdbRows.delete(k);
      }
    } else if (sql.includes('DELETE FROM tmdb_response_cache WHERE updated_at < ?')) {
      const cutoff = Number(params[0]);
      for (const [k, v] of mockTmdbRows.entries()) {
        if (v.updated_at < cutoff) mockTmdbRows.delete(k);
      }
    } else if (sql.includes('DELETE FROM tmdb_response_cache WHERE cache_key NOT IN')) {
      const limit = Number(params[0] || 400);
      const sorted = Array.from(mockTmdbRows.entries()).sort((a, b) => b[1].updated_at - a[1].updated_at);
      for (const [k] of sorted.slice(limit)) {
        mockTmdbRows.delete(k);
      }
    } else if (sql.trim() === 'DELETE FROM tmdb_response_cache') {
      mockTmdbRows.clear();
    }
  }),
  getFirstSync: jest.fn((sql: string, params: any[] = []) => {
    if (sql.includes('FROM explore_content_cache WHERE genre_id = ?')) {
      return mockExploreRows.get(Number(params[0])) ?? null;
    }
    if (sql.includes('FROM tmdb_response_cache WHERE cache_key = ?')) {
      return mockTmdbRows.get(String(params[0])) ?? null;
    }
    return null;
  }),
  getAllSync: jest.fn(() => []),
  withTransactionSync: jest.fn((fn: () => void) => fn()),
  prepareSync: jest.fn(() => ({ executeSync: jest.fn(), finalizeSync: jest.fn() })),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

describe('SQLite response & explore cache persistence', () => {
  beforeEach(() => {
    mockTmdbRows.clear();
    mockExploreRows.clear();
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('saves, reads, and clears tmdb_response_cache by exact key or prefix (escaping wildcards)', () => {
    const database = require('../database') as typeof import('../database');

    database.saveTmdbResponseCacheSync('/tv/37680-{"include_adult":false}', { name: 'Suits', seasons: [1, 2] });
    database.saveTmdbResponseCacheSync('/tv/100-{"include_adult":false}', { name: 'Other Show' });
    database.saveTmdbResponseCacheSync('/movie/50%special-test', { title: 'Special' });

    const suits = database.getTmdbResponseCacheSync('/tv/37680-{"include_adult":false}');
    expect(suits?.data).toEqual({ name: 'Suits', seasons: [1, 2] });
    expect(typeof suits?.updatedAt).toBe('number');

    database.clearTmdbResponseCacheSync('/tv/37680');
    expect(database.getTmdbResponseCacheSync('/tv/37680-{"include_adult":false}')).toBeNull();
    expect(database.getTmdbResponseCacheSync('/tv/100-{"include_adult":false}')?.data).toEqual({
      name: 'Other Show',
    });

    // Prefix containing % should only delete matching literal prefix
    database.clearTmdbResponseCacheSync('/movie/50%');
    expect(database.getTmdbResponseCacheSync('/movie/50%special-test')).toBeNull();
    expect(database.getTmdbResponseCacheSync('/tv/100-{"include_adult":false}')).not.toBeNull();

    // Full clear
    database.clearTmdbResponseCacheSync();
    expect(database.getTmdbResponseCacheSync('/tv/100-{"include_adult":false}')).toBeNull();
  });

  test('self-heals corrupt JSON in tmdb_response_cache instead of crashing', () => {
    const database = require('../database') as typeof import('../database');
    mockTmdbRows.set('/tv/37680-bad', { data_json: '{not valid json', updated_at: Date.now() });

    const entry = database.getTmdbResponseCacheSync('/tv/37680-bad');
    expect(entry).toBeNull();
    expect(mockTmdbRows.has('/tv/37680-bad')).toBe(false);
  });

  test('returns explore cache entry with updatedAt timestamp and respects clearExploreCache', () => {
    const database = require('../database') as typeof import('../database');

    const payload = { trendingMovies: [{ id: 1 }], langData: { en: { movies: [{ id: 2 }], tv: [] } } };
    database.saveExploreContentCacheSync(0, payload);

    const entry = database.getExploreContentCacheEntrySync(0);
    expect(entry?.data).toEqual(payload);
    expect(entry?.updatedAt).toBeGreaterThan(0);
    expect(database.getExploreContentCacheSync(0)).toEqual(payload);

    database.clearExploreCache();
    expect(database.getExploreContentCacheEntrySync(0)).toBeNull();
  });

  test('self-heals corrupt JSON in explore_content_cache instead of crashing', () => {
    const database = require('../database') as typeof import('../database');
    mockExploreRows.set(28, { data_json: '{broken json', updated_at: Date.now() });

    const entry = database.getExploreContentCacheEntrySync(28);
    expect(entry).toBeNull();
    expect(mockExploreRows.has(28)).toBe(false);
  });

  test('prunes expired (>14d) and excess (>400) rows in tmdb_response_cache after 20 writes', () => {
    const database = require('../database') as typeof import('../database');
    const now = Date.now();
    const sixteenDaysAgo = now - 1000 * 60 * 60 * 24 * 16;

    // Seed 1 expired row + 405 recent rows directly
    mockTmdbRows.set('expired-old', { data_json: JSON.stringify({ ok: 1 }), updated_at: sixteenDaysAgo });
    for (let i = 0; i < 405; i++) {
      mockTmdbRows.set(`item-${i}`, {
        data_json: JSON.stringify({ id: i }),
        updated_at: now - (405 - i) * 1000,
      });
    }

    // Perform 20 saves to trigger the periodic prune
    for (let w = 0; w < 20; w++) {
      database.saveTmdbResponseCacheSync(`fresh-${w}`, { w });
    }

    expect(mockTmdbRows.has('expired-old')).toBe(false);
    expect(mockTmdbRows.size).toBe(400);
    expect(mockTmdbRows.has('fresh-19')).toBe(true);
    expect(mockTmdbRows.has('item-0')).toBe(false);
  });
});
