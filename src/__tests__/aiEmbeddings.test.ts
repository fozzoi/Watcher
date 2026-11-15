import { describe, beforeEach, test, expect, jest } from '@jest/globals';

/**
 * Coverage for `pruneAiEmbeddings` — the watchlist embedding garbage collector.
 *
 * The important guarantees are: ids still in the watchlist survive, an empty
 * valid list deletes nothing (an empty list usually means the cloud snapshot has
 * not loaded yet), and large orphan sets are deleted in bounded chunks.
 */

const embeddingRows = new Map<number, number[]>();

const mockDb = {
  execSync: jest.fn(),
  runSync: jest.fn((sql: string, params: any[] = []) => {
    if (sql.includes('DELETE FROM ai_embeddings WHERE media_id IN')) {
      for (const param of params) embeddingRows.delete(Number(param));
    }
  }),
  getAllSync: jest.fn((sql: string) => {
    if (sql.includes('SELECT media_id FROM ai_embeddings')) {
      return Array.from(embeddingRows.keys()).map(media_id => ({ media_id }));
    }
    return [];
  }),
  getFirstSync: jest.fn(() => null),
  prepareSync: jest.fn(() => ({
    executeSync: jest.fn(([mediaId, embedding]: [number, string]) => {
      embeddingRows.set(Number(mediaId), JSON.parse(embedding));
    }),
    finalizeSync: jest.fn(),
  })),
  withTransactionSync: jest.fn((fn: () => void) => fn()),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

const { pruneAiEmbeddings, insertAiEmbedding } = require('../database');

const seed = (ids: number[]) => {
  embeddingRows.clear();
  for (const id of ids) insertAiEmbedding(id, [0.1, 0.2, 0.3]);
};

describe('pruneAiEmbeddings', () => {
  beforeEach(() => {
    embeddingRows.clear();
    mockDb.runSync.mockClear();
  });

  test('keeps watchlist items and removes everything else', () => {
    seed([1, 2, 3, 4, 5]);

    expect(pruneAiEmbeddings([1, 3, 5])).toBe(2);
    expect(Array.from(embeddingRows.keys()).sort((a, b) => a - b)).toEqual([1, 3, 5]);
    expect(mockDb.runSync).toHaveBeenCalledTimes(1);
  });

  test('is a no-op when nothing is orphaned', () => {
    seed([1, 2]);

    expect(pruneAiEmbeddings([1, 2])).toBe(0);
    expect(mockDb.runSync).not.toHaveBeenCalled();
    expect(embeddingRows.size).toBe(2);
  });

  test('deletes nothing when the valid list is empty', () => {
    // Guards the cloud-sync startup window, where the watchlist is briefly empty.
    seed([1, 2, 3]);

    expect(pruneAiEmbeddings([])).toBe(0);
    expect(mockDb.runSync).not.toHaveBeenCalled();
    expect(embeddingRows.size).toBe(3);
  });

  test('deletes large orphan sets in bounded chunks', () => {
    const total = 900;
    seed(Array.from({ length: total }, (_, index) => index + 1));

    expect(pruneAiEmbeddings([1])).toBe(total - 1);
    expect(Array.from(embeddingRows.keys())).toEqual([1]);

    const batchSizes = mockDb.runSync.mock.calls.map(call => (call[1] as any[]).length);
    expect(batchSizes).toEqual([400, 400, 99]);
  });
});
