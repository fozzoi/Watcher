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
  const id = imdbId || tmdbId;
  
  if (type === 'tv') {
    return `${baseUrl}/${type}?tmdb=${tmdbId}&season=${season}&episode=${episode}`;
  }
  return `${baseUrl}/${type}?tmdb=${tmdbId}`;
};
