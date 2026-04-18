import axios from 'axios';

// The URL of your Render backend
const BASE_URL = 'https://watcher-backend-s8wp.onrender.com';

export interface TorrentResult {
  id: string | number;
  name: string;
  size: string;
  source: string;
  magnet: string;
  seeds: number;
  peers: number;
}

/**
 * Searches for torrents via your private Render indexer
 */
export const searchTorrents = async (query: string): Promise<TorrentResult[]> => {
  try {
    console.log(`📡 Sending search request for: ${query}`);
    const response = await axios.get(`${BASE_URL}/api/search_torrents`, {
      params: { q: query },
      timeout: 15000, // Torrents can take a moment to aggregate
    });

    if (response.data?.status === 'success') {
      return response.data.results;
    }
    return [];
  } catch (error) {
    console.error("❌ Torrent Search Bridge Failed:", error);
    return [];
  }
};