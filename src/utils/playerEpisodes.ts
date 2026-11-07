export type EpisodePosition = {
  season: number;
  episode: number;
};

export type SeasonEpisodeCount = readonly [season: number, episodeCount: number];

export const parseEpisodePosition = (
  seasonValue: string | string[] | undefined,
  episodeValue: string | string[] | undefined,
): EpisodePosition | undefined => {
  if (typeof seasonValue !== 'string' || typeof episodeValue !== 'string') return undefined;
  const season = Number(seasonValue);
  const episode = Number(episodeValue);
  if (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1) {
    return undefined;
  }
  return { season, episode };
};

export const parseSeasonEpisodeCounts = (
  value: string | string[] | undefined,
): SeasonEpisodeCount[] => {
  if (typeof value !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is [number, number] =>
        Array.isArray(entry) &&
        entry.length === 2 &&
        Number.isInteger(entry[0]) &&
        entry[0] > 0 &&
        Number.isInteger(entry[1]) &&
        entry[1] > 0,
    );
  } catch {
    return [];
  }
};

export const findAdjacentEpisode = (
  season: number,
  episode: number,
  seasonCounts: readonly SeasonEpisodeCount[],
  direction: -1 | 1,
): EpisodePosition | undefined => {
  const currentSeason = seasonCounts.find(([seasonNumber]) => seasonNumber === season);
  if (!currentSeason) return undefined;

  const nextEpisode = episode + direction;
  if (nextEpisode > 0 && nextEpisode <= currentSeason[1]) {
    return { season, episode: nextEpisode };
  }

  const adjacentSeason = seasonCounts
    .filter(([seasonNumber]) => direction === 1 ? seasonNumber > season : seasonNumber < season)
    .sort(([seasonA], [seasonB]) => direction === 1 ? seasonA - seasonB : seasonB - seasonA)[0];

  if (!adjacentSeason) return undefined;
  return {
    season: adjacentSeason[0],
    episode: direction === 1 ? 1 : adjacentSeason[1],
  };
};
