// src/Scraper.ts
import axios from 'axios';

const BASE_URL = 'https://watcher-api-rho.vercel.app';
const TRACKERS = '&tr=udp://tracker.opentrackr.org:1337/announce&tr=udp://open.stealth.si:80/announce&tr=udp://tracker.torrent.eu.org:451/announce&tr=udp://tracker.bittor.pw:1337/announce&tr=udp://public.popcorn-tracker.org:6969/announce';

export interface TorrentResult {
  id: string | number;
  name: string;
  size: string;
  source: string;
  url: string; 
  seeds: number;
  peers: number;
}

const cleanQuery = (q: string) => 
  q
    .replace(/\b(torrent|download|full|movie|show)\b/gi, '')
    .replace(/[()\[\]\:\']/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const searchTorrents = async (query: string): Promise<TorrentResult[]> => {
  console.log(`📡 Launching Search for: ${query}`);
  
  const cleaned = cleanQuery(query);
  let aggregatedResults: TorrentResult[] = [];

  // 1. Direct Local Fetch: The Pirate Bay (via ApiBay)
  const fetchLocalTPB = async () => {
    try {
      const res = await axios.get(`https://apibay.org/q.php`, { 
        params: { q: cleaned, cat: '' }, 
        timeout: 7000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*'
        }
      });
      
      if (res.data && Array.isArray(res.data) && res.data.length > 0 && res.data[0]?.id !== "0") {
        res.data.forEach((t: any) => {
          if (t.id && t.id !== "0") {
            const bytes = parseInt(t.size) || 0;
            const sizeGB = bytes > 0 ? `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'Unknown';
            aggregatedResults.push({
              id: `tpb-${t.id}`,
              name: t.name,
              size: sizeGB,
              source: 'ThePirateBay',
              url: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}${TRACKERS}`,
              seeds: parseInt(t.seeders) || 0,
              peers: parseInt(t.leechers) || 0,
            });
          }
        });
      }
    } catch (err: any) {
      console.log('⚠️ Local Phone TPB Fetch Error:', err.message);
    }
  };

  // 2. Cloud Proxy Fetch: Hit Vercel Backend (YTS, 1337x, Nyaa, TPB/BitSearch)
  const fetchVercelScrapers = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/torrent`, {
        params: { q: cleaned },
        timeout: 12000, 
      });

      if (response.data?.status === 'success' && Array.isArray(response.data.results)) {
        response.data.results.forEach((item: any) => {
          aggregatedResults.push({
            id: item.id,
            name: item.name,
            size: item.size,
            source: item.source,
            url: item.url || item.magnet,
            seeds: parseInt(item.seeds) || 0,
            peers: parseInt(item.peers) || 0
          });
        });
      }
    } catch (err: any) {
      console.log('⚠️ Vercel Cloud Fetch Error:', err.message);
    }
  };

  // Fire both requests concurrently
  await Promise.allSettled([fetchLocalTPB(), fetchVercelScrapers()]);

  // ==========================================
  // 🎯 SMART FILTERING & DEDUPLICATION
  // ==========================================
  
  // 1. Deduplicate Exact Magnet Links by Hash
  const seenHashes = new Set<string>();
  let uniqueResults: TorrentResult[] = [];

  for (const t of aggregatedResults) {
    if (!t.url) continue;
    const match = t.url.match(/urn:btih:([a-zA-Z0-9]+)/i);
    const hash = match ? match[1].toLowerCase() : t.name.toLowerCase();
    
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      uniqueResults.push(t);
    }
  }

  // 2. Filter out non-matching titles if significant keywords exist
  const keywords = cleaned.toLowerCase().split(' ').filter(w => w.length > 2);
  let finalResults = uniqueResults;
  if (keywords.length > 0) {
    finalResults = uniqueResults.filter(t => {
      const normalizedTitle = t.name.toLowerCase().replace(/[\.\_\-\:\']/g, ' ');
      return keywords.some(k => normalizedTitle.includes(k));
    });
    // Fallback if filter is too restrictive
    if (finalResults.length === 0) finalResults = uniqueResults;
  }

  // 3. Global sort: Highest seeds at the top
  return finalResults.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
};