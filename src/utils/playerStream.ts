import type { PlayerProvider } from './playerPreferences';

export const PROVIDERS: PlayerProvider[] = ['Vidy', 'VidLink', 'Atlantic', 'Movy'];
export const STREAM_LOAD_TIMEOUT_MS = 15000;

export const getNextProvider = (current: PlayerProvider): PlayerProvider => {
  const currentIndex = PROVIDERS.indexOf(current);
  if (currentIndex === -1) return PROVIDERS[0];
  return PROVIDERS[(currentIndex + 1) % PROVIDERS.length];
};

export const buildProviderUrl = (
  provider: PlayerProvider,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  season: number,
  episode: number,
  savedSecs: number,
): string => {
  const progressParam = savedSecs > 10 ? `&progress=${savedSecs}` : '';
  if (provider === 'Vidy') {
    return mediaType === 'tv'
      ? `https://www.vidy.st/tv/${tmdbId}/${season}/${episode}?color=E50914&nextEpisode=true&episodeSelector=true&autoplayNextEpisode=true&autoplay=true&autoplay=1&autoPlay=true${progressParam}`
      : `https://www.vidy.st/movie/${tmdbId}?color=E50914&autoplay=true&autoplay=1&autoPlay=true${progressParam}`;
  }
  if (provider === 'VidLink') {
    return mediaType === 'tv'
      ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1&autoPlay=true`
      : `https://vidlink.pro/movie/${tmdbId}?autoplay=true&autoplay=1&autoPlay=true`;
  }
  if (provider === 'Atlantic') {
    return mediaType === 'tv'
      ? `https://atlantic.st/embed/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1`
      : `https://atlantic.st/embed/movie/${tmdbId}?autoplay=true&autoplay=1`;
  }
  // Movy
  return mediaType === 'tv'
    ? `https://www.movy.sx/tv/${tmdbId}/${season}/${episode}?autoplay=true&autoplay=1`
    : `https://www.movy.sx/movie/${tmdbId}?autoplay=true&autoplay=1`;
};

export const isHttpErrorStatus = (statusCode?: number): boolean =>
  typeof statusCode === 'number' && statusCode >= 400;

export const shouldIgnoreWebViewError = (
  error: { code?: number; domain?: string },
  hasLoaded: boolean,
): boolean => {
  if (!hasLoaded) return false;
  if (error.code === -999 && (!error.domain || error.domain === 'NSURLErrorDomain')) {
    return true;
  }
  if (error.domain === 'WebKitErrorDomain' && (error.code === 101 || error.code === 102)) {
    return true;
  }
  return false;
};

export type StreamErrorDetail =
  | { kind: 'network'; description?: string }
  | { kind: 'http'; statusCode: number; description?: string }
  | { kind: 'renderProcessGone'; didCrash?: boolean }
  | { kind: 'processTerminated' }
  | { kind: 'timeout' };

export const formatStreamErrorMessage = (
  provider: PlayerProvider,
  detail: StreamErrorDetail,
): string => {
  switch (detail.kind) {
    case 'http': {
      const reason = detail.description?.trim();
      return reason
        ? `${provider} returned HTTP ${detail.statusCode} (${reason}).`
        : `${provider} returned HTTP ${detail.statusCode}.`;
    }
    case 'renderProcessGone':
      return detail.didCrash
        ? `${provider} player crashed unexpectedly.`
        : `${provider} player was closed by the system.`;
    case 'processTerminated':
      return `${provider} player session terminated unexpectedly.`;
    case 'timeout':
      return `Timed out while loading ${provider}. Try switching sources or retrying.`;
    case 'network':
    default: {
      const desc = detail.description?.trim();
      return desc || `Could not load ${provider}. Try switching sources or retrying.`;
    }
  }
};

export interface PlayerStreamState {
  attemptId: number;
  streamUrl: string | null;
  loading: boolean;
  error: string | null;
  hasLoaded: boolean;
  reloadNonce: number;
}

export const INITIAL_PLAYER_STREAM_STATE: PlayerStreamState = {
  attemptId: 0,
  streamUrl: null,
  loading: true,
  error: null,
  hasLoaded: false,
  reloadNonce: 0,
};

export type PlayerStreamAction =
  | { type: 'START_INIT'; attemptId: number }
  | { type: 'STREAM_READY'; attemptId: number; url: string }
  | { type: 'INIT_FAILED'; attemptId: number; message: string }
  | { type: 'LOAD_SUCCESS'; attemptId: number }
  | { type: 'LOAD_END'; attemptId: number }
  | { type: 'LOAD_ERROR'; attemptId: number; message: string; code?: number; domain?: string }
  | { type: 'LOAD_TIMEOUT'; attemptId: number; provider: PlayerProvider }
  | { type: 'RETRY'; attemptId: number };

export const playerStreamReducer = (
  state: PlayerStreamState,
  action: PlayerStreamAction,
): PlayerStreamState => {
  switch (action.type) {
    case 'START_INIT':
      return {
        ...state,
        attemptId: action.attemptId,
        streamUrl: null,
        loading: true,
        error: null,
        hasLoaded: false,
      };
    case 'STREAM_READY':
      if (action.attemptId !== state.attemptId) return state;
      return {
        ...state,
        streamUrl: action.url,
        loading: true,
        error: null,
        hasLoaded: false,
      };
    case 'INIT_FAILED':
      if (action.attemptId !== state.attemptId) return state;
      return {
        ...state,
        streamUrl: null,
        loading: false,
        error: action.message,
        hasLoaded: false,
      };
    case 'LOAD_SUCCESS':
      if (action.attemptId !== state.attemptId) return state;
      if (state.error) return state;
      return {
        ...state,
        hasLoaded: true,
        loading: false,
      };
    case 'LOAD_END':
      if (action.attemptId !== state.attemptId) return state;
      return {
        ...state,
        loading: false,
      };
    case 'LOAD_ERROR':
      if (action.attemptId !== state.attemptId) return state;
      if (shouldIgnoreWebViewError({ code: action.code, domain: action.domain }, state.hasLoaded)) {
        return state.loading ? { ...state, loading: false } : state;
      }
      return {
        ...state,
        loading: false,
        hasLoaded: false,
        error: state.error ?? action.message,
      };
    case 'LOAD_TIMEOUT':
      if (action.attemptId !== state.attemptId) return state;
      if (!state.loading || state.error) return state;
      return {
        ...state,
        loading: false,
        error: formatStreamErrorMessage(action.provider, { kind: 'timeout' }),
      };
    case 'RETRY':
      return {
        ...state,
        attemptId: action.attemptId,
        loading: true,
        error: null,
        hasLoaded: false,
        reloadNonce: state.reloadNonce + 1,
      };
    default:
      return state;
  }
};
