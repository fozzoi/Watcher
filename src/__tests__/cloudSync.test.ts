/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';

const mockAsyncStorage = new Map<string, string>();
const mockAxiosGet = jest.fn<(...args: any[]) => Promise<any>>();
const mockAxiosPost = jest.fn<(...args: any[]) => Promise<any>>();
const mockDeviceEvents: Array<{ event: string; payload: any }> = [];
let mockUuidCounter = 0;

type SqlRow = { id: string; media_id: number; type: string; data: string; created_at: number };
const mockSavedRows = new Map<string, SqlRow>();

const mockDb = {
  execSync: jest.fn(() => {}),
  runSync: jest.fn((sql: string, params: any[] = []) => {
    if (sql.includes('DELETE FROM saved_items WHERE type = ?')) {
      const targetType = String(params[0]);
      for (const [k, row] of mockSavedRows.entries()) {
        if (row.type === targetType) mockSavedRows.delete(k);
      }
    } else if (sql.includes('DELETE FROM saved_items WHERE id = ?')) {
      mockSavedRows.delete(String(params[0]));
    } else if (sql.trim() === 'DELETE FROM saved_items') {
      mockSavedRows.clear();
    } else if (sql.includes('INSERT OR REPLACE INTO saved_items')) {
      const [id, media_id, type, data, created_at] = params;
      mockSavedRows.set(String(id), { id: String(id), media_id: Number(media_id), type: String(type), data: String(data), created_at: Number(created_at) });
    }
  }),
  getAllSync: jest.fn((sql: string, params: any[] = []) => {
    if (sql.includes('FROM saved_items WHERE type = ? AND media_id = ?')) {
      const [type, mediaId] = params;
      return Array.from(mockSavedRows.values()).filter(r => r.type === String(type) && r.media_id === Number(mediaId));
    }
    if (sql.includes('FROM saved_items WHERE type = ?')) {
      const [type] = params;
      return Array.from(mockSavedRows.values())
        .filter(r => r.type === String(type))
        .sort((a, b) => b.created_at - a.created_at);
    }
    return [];
  }),
  getFirstSync: jest.fn(() => null),
  withTransactionSync: jest.fn((fn: () => void) => fn()),
  prepareSync: jest.fn((sql: string) => ({
    executeSync: (params: any[]) => mockDb.runSync(sql, params),
    finalizeSync: jest.fn(),
  })),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `op-${++mockUuidCounter}`),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsyncStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockAsyncStorage.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockAsyncStorage.delete(k);
    }),
  },
}));

jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn((event: string, payload: any) => {
      mockDeviceEvents.push({ event, payload });
    }),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    post: (...args: any[]) => mockAxiosPost(...args),
    create: jest.fn(() => ({
      get: jest.fn(),
      interceptors: { response: { use: jest.fn() } },
    })),
  },
}));

jest.mock('../services/tasteProfile', () => ({
  logTasteEvent: jest.fn(),
  TASTE_WEIGHTS: { COMPLETED_WATCH: 1, DROPPED_EARLY: -1 },
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

describe('Android cloudSync, database, and progress synchronization', () => {
  beforeEach(() => {
    mockAsyncStorage.clear();
    mockSavedRows.clear();
    mockDeviceEvents.length = 0;
    mockAxiosGet.mockReset();
    mockAxiosPost.mockReset();
    mockUuidCounter = 0;
    jest.useRealTimers();
    jest.resetModules();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('preserves concurrent outbox mutation added while another mutation is in flight', async () => {
    mockAsyncStorage.set('cloud_auth_token', 'tok-1');
    mockAsyncStorage.set('cloud_auth_user', JSON.stringify({ userId: 'u-1', email: 'a@b.c', name: 'A', picture: '' }));
    mockAsyncStorage.set('cloud_sync_revision', '4');

    const database = require('../database') as typeof import('../database');
    const cloudSyncMod = require('../cloudSync') as typeof import('../cloudSync');

    database.setCloudOnlyMode(true, { watchlist: [], history: [], favoriteArtists: [] });
    database.setOnSavedItemsChangedListener((m) => cloudSyncMod.queueCloudMutation(m));

    const firstPost = deferred<any>();
    mockAxiosPost
      .mockImplementationOnce(() => firstPost.promise)
      .mockResolvedValueOnce({ status: 200, data: { status: 'mutated', revision: 6 } });

    database.addSavedItem({ id: 101, media_type: 'movie', title: 'Movie 1' }, 'watchlist');
    await new Promise(res => setTimeout(res, 10));
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);

    // Enqueue second edit while the first POST is still awaiting response
    database.addSavedItem({ id: 102, media_type: 'movie', title: 'Movie 2' }, 'watchlist');
    await cloudSyncMod.waitForPendingOutboxWrites();

    firstPost.resolve({ status: 200, data: { status: 'mutated', revision: 5 } });
    await new Promise(res => setTimeout(res, 20));
    await cloudSyncMod.flushCloudOutbox();

    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockAxiosPost.mock.calls[1][1].mutation.item.id).toBe(102);
    expect(JSON.parse(mockAsyncStorage.get('cloud_sync_outbox_v1:u-1') || '[]')).toEqual([]);
    expect(mockAsyncStorage.get('cloud_sync_revision')).toBe('6');
  });

  test('does not overwrite pending local edits when flush fails and pollCloudChanges runs', async () => {
    mockAsyncStorage.set('cloud_auth_token', 'tok-1');
    mockAsyncStorage.set('cloud_auth_user', JSON.stringify({ userId: 'u-1', email: 'a@b.c', name: 'A', picture: '' }));
    mockAsyncStorage.set('cloud_sync_revision', '1');

    const database = require('../database') as typeof import('../database');
    const cloudSyncMod = require('../cloudSync') as typeof import('../cloudSync');

    database.setCloudOnlyMode(true, { watchlist: [], history: [], favoriteArtists: [] });
    database.setOnSavedItemsChangedListener((m) => cloudSyncMod.queueCloudMutation(m));

    mockAxiosPost.mockRejectedValue(new Error('Network offline'));

    database.addSavedItem({ id: 555, media_type: 'movie', title: 'Offline Add' }, 'watchlist');
    await cloudSyncMod.waitForPendingOutboxWrites();
    await new Promise(res => setTimeout(res, 10));

    // Poll should bail before fetching/applying snapshot while outbox still has pending items
    const res = await cloudSyncMod.cloudSync.syncWithCloud();
    expect(res.success).toBe(false);
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(database.getSavedItems('watchlist').map(i => i.id)).toEqual([555]);
  });

  test('restores cloudItems to SQLite and clears session on HTTP 401', async () => {
    mockAsyncStorage.set('cloud_auth_token', 'expired-tok');
    mockAsyncStorage.set('cloud_auth_user', JSON.stringify({ userId: 'u-1', email: 'a@b.c', name: 'A', picture: '' }));
    mockAsyncStorage.set('cloud_sync_revision', '2');

    const database = require('../database') as typeof import('../database');
    const cloudSyncMod = require('../cloudSync') as typeof import('../cloudSync');

    database.setCloudOnlyMode(true, {
      watchlist: [{ id: 10, media_type: 'movie', title: 'Keep Me' }],
      history: [{ id: 20, media_type: 'collection', name: 'Saga' }],
      favoriteArtists: [],
    });

    mockAxiosGet.mockRejectedValueOnce({ response: { status: 401, data: { error: 'Unauthorized' } } });

    const res = await cloudSyncMod.cloudSync.syncWithCloud();
    expect(res.success).toBe(false);
    expect(mockAsyncStorage.get('cloud_auth_token')).toBeUndefined();
    expect(mockAsyncStorage.get('cloud_auth_user')).toBeUndefined();
    // Items were restored to SQLite cleanly instead of vanishing
    expect(database.getSavedItems('watchlist').map(i => i.id)).toEqual([10]);
    expect(database.getSavedItems('history').map(i => ({ id: i.id, type: i.media_type }))).toEqual([{ id: 20, type: 'collection' }]);
    expect(mockDeviceEvents.some(e => e.event === 'watcher_cloud_auth_changed' && e.payload === null)).toBe(true);
  });

  test('preserves item order on logout and keeps collection separate from movie with same id', () => {
    const database = require('../database') as typeof import('../database');

    database.setCloudOnlyMode(true, {
      watchlist: [
        { id: 10, media_type: 'movie', title: 'Movie 10' },
        { id: 10, media_type: 'collection', name: 'Collection 10' },
      ],
      history: [],
      favoriteArtists: [],
    });

    expect(database.getSavedItems('watchlist')).toHaveLength(2);
    database.setCloudOnlyMode(false);

    const restored = database.getSavedItems('watchlist');
    expect(restored.map(i => `${i.media_type}:${i.id}`)).toEqual(['movie:10', 'collection:10']);
  });

  test('throttles playback ticks, merges progress by updatedAt, syncs removal, and clears @watch_progress on account switch', async () => {
    mockAsyncStorage.set('cloud_auth_token', 'tok-1');
    mockAsyncStorage.set('cloud_auth_user', JSON.stringify({ userId: 'u-1', email: 'a@b.c', name: 'A', picture: '' }));
    mockAsyncStorage.set('cloud_sync_revision', '3');

    const cloudSyncMod = require('../cloudSync') as typeof import('../cloudSync');
    const progressMod = require('../utils/progress') as typeof import('../utils/progress');

    mockAxiosPost.mockResolvedValue({ status: 200, data: { status: 'mutated', revision: 4 } });

    await progressMod.saveProgress({
      tmdbId: 900,
      mediaType: 'tv',
      title: 'Show',
      poster: '/p.jpg',
      lastSeason: 1,
      lastEpisode: 2,
      position: 100,
      duration: 1000,
      updatedAt: 1000,
    });
    // Subsequent ticks within throttle window should coalesce locally rather than firing immediate POSTs
    await progressMod.saveProgress({
      tmdbId: 900,
      mediaType: 'tv',
      title: 'Show',
      poster: '/p.jpg',
      lastSeason: 1,
      lastEpisode: 2,
      position: 150,
      duration: 1000,
      updatedAt: 2000,
    });
    await new Promise(res => setTimeout(res, 15));
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);

    await progressMod.flushPendingCloudProgressSync();
    await new Promise(res => setTimeout(res, 15));
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockAxiosPost.mock.calls[1][1].mutation.value['900'].position).toBe(150);

    // Remote older watchProgress delta must NOT overwrite newer local position 150
    mockAxiosGet.mockResolvedValueOnce({
      data: {
        status: 'delta',
        revision: 6,
        changes: [
          {
            revision: 6,
            action: 'set',
            type: 'watchProgress',
            value: {
              '900': { tmdbId: 900, mediaType: 'tv', lastSeason: 1, lastEpisode: 2, position: 50, duration: 1000, updatedAt: 500 },
              'tv:900:1:2': { tmdbId: 900, mediaType: 'tv', lastSeason: 1, lastEpisode: 2, position: 50, duration: 1000, updatedAt: 500 },
            },
          },
        ],
      },
    });
    mockAsyncStorage.set('cloud_sync_revision', '5');
    await cloudSyncMod.pollCloudChanges();
    const afterPull = await progressMod.getProgress(900);
    expect(afterPull?.position).toBe(150);

    // removeProgress clears both keys and queues removal mutation
    await progressMod.removeProgress(900);
    await new Promise(res => setTimeout(res, 15));
    expect(mockAsyncStorage.get('@watch_progress')).toBe('{}');
    expect(mockAsyncStorage.get('watch_progress_v1')).toBe('{}');
    expect(mockAxiosPost.mock.calls.at(-1)?.[1].mutation).toMatchObject({
      type: 'watchProgress',
      action: 'remove',
      mediaId: 900,
    });

    // Switching account clears @watch_progress too
    mockAsyncStorage.set('@watch_progress', JSON.stringify({ '900': { position: 150 } }));
    mockAsyncStorage.set('cloud_local_library_owner', 'u-1');
    mockAxiosPost.mockResolvedValueOnce({
      data: { user: { userId: 'u-2', email: 'u2@b.c', name: 'U2', picture: '' }, token: 'tok-2' },
    });
    mockAxiosPost.mockResolvedValueOnce({
      data: { status: 'synced', revision: 1, library: { watchlist: [], history: [], favoriteArtists: [], watchProgress: {} } },
    });
    await cloudSyncMod.cloudSync.loginWithDemo();
    expect(mockAsyncStorage.get('@watch_progress')).toBe('{}');
  });
});
