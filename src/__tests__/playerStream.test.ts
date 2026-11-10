import { describe, test, expect } from '@jest/globals';
import {
  buildProviderUrl,
  formatStreamErrorMessage,
  getNextProvider,
  INITIAL_PLAYER_STREAM_STATE,
  isHttpErrorStatus,
  playerStreamReducer,
  PROVIDERS,
  shouldIgnoreWebViewError,
} from '../utils/playerStream';

describe('playerStream helpers & state reducer', () => {
  test('cycles providers in expected order and wraps around', () => {
    expect(PROVIDERS).toEqual(['Vidy', 'VidLink', 'Atlantic', 'Movy']);
    expect(getNextProvider('Vidy')).toBe('VidLink');
    expect(getNextProvider('VidLink')).toBe('Atlantic');
    expect(getNextProvider('Atlantic')).toBe('Movy');
    expect(getNextProvider('Movy')).toBe('Vidy');
  });

  test('builds provider URLs for movies and TV episodes with progress only when > 10s', () => {
    expect(buildProviderUrl('Vidy', 123, 'movie', 1, 1, 10)).not.toContain('progress=');
    expect(buildProviderUrl('Vidy', 123, 'movie', 1, 1, 45)).toContain('https://www.vidy.st/movie/123');
    expect(buildProviderUrl('Vidy', 123, 'movie', 1, 1, 45)).toContain('&progress=45');
    expect(buildProviderUrl('VidLink', 99, 'tv', 2, 5, 120)).toContain('https://vidlink.pro/tv/99/2/5');
    expect(buildProviderUrl('Atlantic', 99, 'tv', 2, 5, 0)).toContain('https://atlantic.st/embed/tv/99/2/5');
    expect(buildProviderUrl('Movy', 99, 'movie', 1, 1, 0)).toContain('https://www.movy.sx/movie/99');
  });

  test('identifies HTTP error status codes >= 400 only', () => {
    expect(isHttpErrorStatus(undefined)).toBe(false);
    expect(isHttpErrorStatus(200)).toBe(false);
    expect(isHttpErrorStatus(302)).toBe(false);
    expect(isHttpErrorStatus(400)).toBe(true);
    expect(isHttpErrorStatus(404)).toBe(true);
    expect(isHttpErrorStatus(502)).toBe(true);
  });

  test('ignores iOS cancelled navigations only after stream has already loaded', () => {
    expect(shouldIgnoreWebViewError({ code: -999, domain: 'NSURLErrorDomain' }, false)).toBe(false);
    expect(shouldIgnoreWebViewError({ code: -999, domain: 'NSURLErrorDomain' }, true)).toBe(true);
    expect(shouldIgnoreWebViewError({ code: 102, domain: 'WebKitErrorDomain' }, true)).toBe(true);
    expect(shouldIgnoreWebViewError({ code: -2 }, true)).toBe(false);
  });

  test('clears loading on WebView error and preserves error if onLoadEnd fires afterward', () => {
    let state = playerStreamReducer(INITIAL_PLAYER_STREAM_STATE, { type: 'START_INIT', attemptId: 1 });
    state = playerStreamReducer(state, {
      type: 'STREAM_READY',
      attemptId: 1,
      url: 'https://vidlink.pro/movie/123',
    });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();

    state = playerStreamReducer(state, {
      type: 'LOAD_ERROR',
      attemptId: 1,
      code: -2,
      message: formatStreamErrorMessage('VidLink', { kind: 'network', description: 'ERR_NAME_NOT_RESOLVED' }),
    });
    expect(state.loading).toBe(false);
    expect(state.error).toBe('ERR_NAME_NOT_RESOLVED');

    // Late onLoadEnd from WebView must NOT clear the recorded error
    state = playerStreamReducer(state, { type: 'LOAD_END', attemptId: 1 });
    expect(state.loading).toBe(false);
    expect(state.error).toBe('ERR_NAME_NOT_RESOLVED');
  });

  test('handles stalled WebView load via LOAD_TIMEOUT and ignores stale attempts', () => {
    let state = playerStreamReducer(INITIAL_PLAYER_STREAM_STATE, { type: 'START_INIT', attemptId: 1 });
    state = playerStreamReducer(state, {
      type: 'STREAM_READY',
      attemptId: 1,
      url: 'https://www.vidy.st/movie/123',
    });

    // User switches source -> attemptId increments to 2
    state = playerStreamReducer(state, { type: 'START_INIT', attemptId: 2 });
    state = playerStreamReducer(state, {
      type: 'STREAM_READY',
      attemptId: 2,
      url: 'https://vidlink.pro/movie/123',
    });

    // Stale timeout from attempt 1 must be ignored
    state = playerStreamReducer(state, { type: 'LOAD_TIMEOUT', attemptId: 1, provider: 'Vidy' });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();

    // Timeout on active attempt 2 clears loading and surfaces timeout error
    state = playerStreamReducer(state, { type: 'LOAD_TIMEOUT', attemptId: 2, provider: 'VidLink' });
    expect(state.loading).toBe(false);
    expect(state.error).toContain('Timed out while loading VidLink');

    // Retry increments attemptId and reloadNonce so dead/errored WebView remounts cleanly
    state = playerStreamReducer(state, { type: 'RETRY', attemptId: 3 });
    expect(state.attemptId).toBe(3);
    expect(state.reloadNonce).toBe(1);
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  test('ignores timeout after successful load', () => {
    let state = playerStreamReducer(INITIAL_PLAYER_STREAM_STATE, { type: 'START_INIT', attemptId: 1 });
    state = playerStreamReducer(state, {
      type: 'STREAM_READY',
      attemptId: 1,
      url: 'https://www.vidy.st/movie/123',
    });
    state = playerStreamReducer(state, { type: 'LOAD_SUCCESS', attemptId: 1 });
    state = playerStreamReducer(state, { type: 'LOAD_END', attemptId: 1 });
    state = playerStreamReducer(state, { type: 'LOAD_TIMEOUT', attemptId: 1, provider: 'Vidy' });

    expect(state.loading).toBe(false);
    expect(state.hasLoaded).toBe(true);
    expect(state.error).toBeNull();
  });
});
