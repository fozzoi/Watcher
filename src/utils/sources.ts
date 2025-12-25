// src/utils/sources.ts

export const STREAM_SOURCES = [
  // 1. VidSrc CC (Your preferred UI) - FIRST PRIORITY
  { name: 'VidSrc CC', url: 'https://vidsrc.cc/v2/embed' },
  // 2. VidSrc.to (Backup)
  { name: 'VidSrc TO', url: 'https://vidsrc.to/embed' },
  // 3. SuperEmbed (Backup)
  { name: 'SuperEmbed', url: 'https://superembed.stream/strembed' },
];

export const makeStreamUrl = (baseUrl: string, mediaType: string, tmdbId: number, imdbId?: string, season?: number, episode?: number) => {
    const type = mediaType === 'movie' ? 'movie' : 'tv';
    const id = imdbId || tmdbId;
    
    // VidSrc (TO / CC / PRO) logic
    if (baseUrl.includes('vidsrc')) {
        if (mediaType === 'movie') return `${baseUrl}/movie/${id}`;
        return `${baseUrl}/tv/${id}/${season}/${episode}`;
    }
    
    // SuperEmbed logic
    const query = mediaType === 'tv' ? `&s=${season}&e=${episode}` : '';
    if (baseUrl.includes('superembed')) {
        return `${baseUrl}?tmdb=${tmdbId}${query}`;
    }

    return `${baseUrl}/${type}/${id}`;
};