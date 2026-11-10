/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, beforeEach, test, expect, jest } from '@jest/globals';

const mockSaveForYouShelves = jest.fn<(shelves: any[]) => void>();
const mockGetForYouCachedShelves = jest.fn<() => any[]>(() => []);
const mockGetSavedItems = jest.fn<(...args: any[]) => any[]>(() => []);
const mockGetRecentTasteEvents = jest.fn<(...args: any[]) => any[]>(() => []);
const mockGetCollectionDetails = jest.fn<(...args: any[]) => Promise<any>>();
const mockDiscoverMovies = jest.fn<(...args: any[]) => Promise<any[]>>(async () => []);
const mockGetMovieCollectionId = jest.fn<(...args: any[]) => Promise<number | null>>(async () => null);
const mockGetPersonCombinedCredits = jest.fn<(...args: any[]) => Promise<any[]>>(async () => []);

jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 400, height: 800 }) },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => {}),
    removeItem: jest.fn(async () => {}),
  },
}));

jest.mock('../database', () => ({
  getRecentTasteEvents: (...args: any[]) => mockGetRecentTasteEvents(...args),
  insertTasteEvent: jest.fn(),
  saveForYouShelves: (...args: [any[]]) => mockSaveForYouShelves(...args),
  getForYouCachedShelves: () => mockGetForYouCachedShelves(),
  getForYouCacheLastUpdated: jest.fn(() => 0),
  getSavedItems: (...args: any[]) => mockGetSavedItems(...args),
  restoreTasteEvents: jest.fn(),
}));

jest.mock('../tmdb', () => ({
  discoverMovies: (...args: any[]) => mockDiscoverMovies(...args),
  getPersonCombinedCredits: (...args: any[]) => mockGetPersonCombinedCredits(...args),
  getCollectionDetails: (...args: any[]) => mockGetCollectionDetails(...args),
  getMovieCollectionId: (...args: any[]) => mockGetMovieCollectionId(...args),
}));

describe('tasteProfile franchise collection IDs and For You shelf generation', () => {
  beforeEach(() => {
    mockSaveForYouShelves.mockReset();
    mockGetForYouCachedShelves.mockReset();
    mockGetForYouCachedShelves.mockReturnValue([]);
    mockGetSavedItems.mockReset();
    mockGetSavedItems.mockReturnValue([]);
    mockGetRecentTasteEvents.mockReset();
    mockGetRecentTasteEvents.mockReturnValue([]);
    mockGetCollectionDetails.mockReset();
    mockDiscoverMovies.mockReset();
    mockDiscoverMovies.mockResolvedValue([]);
    mockGetMovieCollectionId.mockReset();
    mockGetMovieCollectionId.mockResolvedValue(null);
    mockGetPersonCombinedCredits.mockReset();
    mockGetPersonCombinedCredits.mockResolvedValue([]);
    jest.resetModules();
  });

  test('does not include stale/404 collection IDs and uses valid Dune Collection ID 726871', () => {
    const tasteProfile = require('../services/tasteProfile') as typeof import('../services/tasteProfile');

    const allIds = [
      ...Object.values(tasteProfile.ICONIC_FRANCHISES_BY_GENRE).flat(),
      ...tasteProfile.DEFAULT_POPULAR_FRANCHISES,
    ];

    // Known invalid/404 TMDB collection IDs previously present
    for (const badId of [724855, 480261, 12, 1157, 871131, 618529]) {
      expect(allIds).not.toContain(badId);
    }

    // Dune Collection (726871) must be in Sci-Fi (878) and DEFAULT_POPULAR_FRANCHISES, NOT Horror (27)
    expect(tasteProfile.ICONIC_FRANCHISES_BY_GENRE[878]).toContain(726871);
    expect(tasteProfile.DEFAULT_POPULAR_FRANCHISES).toContain(726871);
    expect(tasteProfile.ICONIC_FRANCHISES_BY_GENRE[27]).not.toContain(726871);
  });

  test('generateForYouShelves queries valid collection IDs (including 726871) and never 724855', async () => {
    const tasteProfile = require('../services/tasteProfile') as typeof import('../services/tasteProfile');

    // Seed Sci-Fi (878) taste event so Sci-Fi franchises are queried first
    mockGetRecentTasteEvents.mockReturnValue([
      {
        entity_type: 'movie',
        entity_id: '438631',
        entity_name: 'Dune',
        genres: '878',
        keywords: null,
        weight: 4.0,
        timestamp: Date.now(),
      },
    ]);

    mockGetCollectionDetails.mockImplementation(async (colId: number) => ({
      id: colId,
      name: colId === 726871 ? 'Dune Collection' : `Collection ${colId}`,
      overview: '',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      media_type: 'collection',
      parts: [
        {
          id: colId * 10 + 1,
          title: 'Part 1',
          release_date: '2021-10-22',
          poster_path: '/p1.jpg',
          vote_average: 7.8,
          vote_count: 5000,
          popularity: 80,
        },
        {
          id: colId * 10 + 2,
          title: 'Part 2',
          release_date: '2024-02-27',
          poster_path: '/p2.jpg',
          vote_average: 8.2,
          vote_count: 4500,
          popularity: 90,
        },
      ],
    }));

    const storedShelves: any[] = [];
    mockSaveForYouShelves.mockImplementation((shelves: any[]) => {
      storedShelves.splice(0, storedShelves.length, ...shelves);
    });
    mockGetForYouCachedShelves.mockImplementation(() => storedShelves);

    const shelves = await tasteProfile.generateForYouShelves();

    const requestedIds = mockGetCollectionDetails.mock.calls.map((c) => c[0]);
    expect(requestedIds).toContain(726871);
    expect(requestedIds).not.toContain(724855);
    expect(requestedIds).not.toContain(480261);
    expect(requestedIds).not.toContain(12);
    expect(requestedIds).not.toContain(1157);
    expect(requestedIds).not.toContain(871131);
    expect(shelves.some((s) => s.shelfId === 'saga-all' || (s as any).shelf_id === 'saga-all')).toBe(true);
  });

  test('skips invalid/NaN collection IDs in saved items and tolerates null 404 responses', async () => {
    const tasteProfile = require('../services/tasteProfile') as typeof import('../services/tasteProfile');

    mockGetSavedItems.mockImplementation((kind: string) => {
      if (kind === 'history') {
        return [
          { id: 'bad-id', media_type: 'movie' },
          { id: 438631, belongs_to_collection: { id: 726871 } },
          { id: 100, belongs_to_collection: { id: 'not-a-number' } },
        ];
      }
      if (kind === 'watchlist') {
        return [{ id: 0, media_type: 'collection' }, { id: -5, media_type: 'collection' }];
      }
      return [];
    });

    mockGetCollectionDetails.mockResolvedValue(null);
    const storedShelves: any[] = [];
    mockSaveForYouShelves.mockImplementation((shelves: any[]) => {
      storedShelves.splice(0, storedShelves.length, ...shelves);
    });
    mockGetForYouCachedShelves.mockImplementation(() => storedShelves);

    const shelves = await tasteProfile.generateForYouShelves();

    expect(mockGetMovieCollectionId).not.toHaveBeenCalled();
    const requestedIds = mockGetCollectionDetails.mock.calls.map((c) => c[0]);
    expect(requestedIds.every((id) => Number.isInteger(id) && id > 0)).toBe(true);
    expect(requestedIds).toContain(726871);
    expect(shelves.some((s) => s.shelfId === 'saga-all' || (s as any).shelf_id === 'saga-all')).toBe(true);
  });
});
