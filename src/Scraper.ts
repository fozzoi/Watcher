// src/Scraper.ts
import axios from 'axios';
import { GLOBAL_CONFIG } from './tmdb';

const BASE_URL = 'https://watcher-api-rho.vercel.app';
const BLOCKED_WORDS = [
  'porn', 'sex', 'xxx', 'x-x-x', 'brazzers', 'xart', 'x-art', 'nympho', 'adult', 
  'cum', 'creampie', 'squirting', 'gangbang', 'onlyfans', 'ass', 'asses', 'boobs', 
  'tits', 'pornographic', 'sexually', 'rape', 'hentai', 'naughty', 'nude', 
  'naughtyamerica', 'milf', 'uncensored', 'jav', 'sukebei', 'erotica', 'incest', 
  'teens', 'pussy', 'dick', 'cock', 'blowjob', 'naked', '.xxx.', 'stepsister', 
  'stepmom', 'stepbrother', 'stepdaughter', 'stepdad', 'vixen', 'fetish', 
  'blacked', 'bbc', 'anal', 'squirt'
];
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

  // 🚨 PRE-SEARCH NSFW CHECK (Query Level)
  if (GLOBAL_CONFIG.nsfwFilterEnabled) {
    const isNSFWQuery = BLOCKED_WORDS.some(word => query.toLowerCase().includes(word) || cleaned.toLowerCase().includes(word));
    if (isNSFWQuery) {
      console.log('🚨 Search blocked by NSFW filter');
      throw new Error("NSFW Filter is ON. This search query contains restricted words and was not forwarded.");
    }
  }

  let aggregatedResults: TorrentResult[] = [];



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

  // Fire request
  await fetchVercelScrapers();

  // ==========================================
  // 🎯 SMART FILTERING & DEDUPLICATION
  // ==========================================
  
  // 0. NSFW Filter
  if (GLOBAL_CONFIG.nsfwFilterEnabled) {
    aggregatedResults = aggregatedResults.filter(t => {
      const normalizedTitle = t.name.toLowerCase();
      // Drop the torrent if it contains any of the blocked words
      return !BLOCKED_WORDS.some(word => normalizedTitle.includes(word));
    });
  }

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
      return keywords.every(k => normalizedTitle.includes(k));
    });
    // Fallback if filter is too restrictive
    if (finalResults.length === 0) finalResults = uniqueResults;
  }

  // 3. Global sort: Highest seeds at the top
  return finalResults.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));
};