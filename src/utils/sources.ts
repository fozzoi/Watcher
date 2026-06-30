export const STREAM_SOURCES = [
  { name: 'Server 1', url: 'https://vidsrc.me/embed' },
  { name: 'Server 2', url: 'https://vidsrc.to/embed' },
  { name: 'Server 3', url: 'https://multiembed.mov/directstream.php' }
];

export const makeStreamUrl = (
  baseUrl: string,
  mediaType: string | undefined,
  tmdbId: number | string,
  imdbId?: string | null,
  season: number = 1,
  episode: number = 1
): string => {
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  
  if (baseUrl.includes('vidsrc.me') || baseUrl.includes('vidsrc.to')) {
    if (type === 'tv') {
      return `${baseUrl}/tv/${tmdbId}/${season}/${episode}`;
    }
    return `${baseUrl}/movie/${tmdbId}`;
  }

  // Fallback / multiembed.mov format
  if (type === 'tv') {
    return `${baseUrl}?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`;
  }
  return `${baseUrl}?video_id=${tmdbId}&tmdb=1`;
};
