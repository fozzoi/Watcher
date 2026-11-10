/** @jest-environment jsdom */
/* eslint-disable @typescript-eslint/no-require-imports */
import React, { act } from 'react';
import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { STREAM_LOAD_TIMEOUT_MS } from '../utils/playerStream';

const { createRoot } = require('react-dom/client');

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let latestWebViewProps: any = null;
let webViewMountCount = 0;
let mockRouteParams: Record<string, any> = {
  id: '438631',
  media_type: 'movie',
  title: 'Dune',
  poster: '/dune.jpg',
};
const mockStopLoading = jest.fn<() => void>();
const mockInjectJavaScript = jest.fn<(script: string) => void>();
const mockRouterBack = jest.fn<() => void>();
const mockRouterReplace = jest.fn<(url: string) => void>();
const mockSavePlayerPreferences = jest.fn<(...args: any[]) => Promise<any>>(async () => ({}));
const mockGetPlayerPreferences = jest.fn<(...args: any[]) => Promise<any>>(async () => ({
  volume: 1,
  muted: false,
  audioTrack: null,
  subtitleTrack: null,
  quality: 'auto',
  fitMode: 'cover',
  preferredProvider: 'Vidy',
}));
const mockGetProgress = jest.fn<(...args: any[]) => Promise<any>>(async () => null);

jest.mock('react-native', () => {
  const ReactActual = require('react');
  const makeHost = (tag: string) =>
    ReactActual.forwardRef(
      (
        {
          children,
          onPress,
          accessibilityLabel,
          accessibilityRole: _accessibilityRole,
          activeOpacity: _activeOpacity,
          hitSlop: _hitSlop,
          ...rest
        }: any,
        ref: any,
      ) =>
        ReactActual.createElement(
          tag,
          {
            ...rest,
            ref,
            'aria-label': accessibilityLabel,
            onClick: onPress,
          },
          children,
        ),
    );
  return {
    View: makeHost('div'),
    Text: makeHost('span'),
    TouchableOpacity: makeHost('button'),
    StyleSheet: {
      create: (s: any) => s,
      absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    },
    Platform: { OS: 'android' },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    BackHandler: {
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    StatusBar: {
      setHidden: jest.fn(),
    },
  };
});

jest.mock('../components/shared/LoadingIndicator', () => ({
  LoadingIndicator: () => require('react').createElement('div', { 'data-testid': 'spinner' }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
  setStatusBarHidden: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const ReactActual = require('react');
  const WebView = ReactActual.forwardRef((props: any, ref: any) => {
    latestWebViewProps = props;
    ReactActual.useEffect(() => {
      webViewMountCount += 1;
    }, []);
    ReactActual.useImperativeHandle(ref, () => ({
      stopLoading: mockStopLoading,
      injectJavaScript: mockInjectJavaScript,
    }));
    return ReactActual.createElement('div', {
      'data-testid': 'webview',
      'data-uri': props.source?.uri,
    });
  });
  return { WebView };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, replace: mockRouterReplace }),
  useLocalSearchParams: () => mockRouteParams,
  Stack: { Screen: () => null },
}));

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
  Orientation: { LANDSCAPE_LEFT: 3, LANDSCAPE_RIGHT: 4 },
  lockAsync: jest.fn(async () => {}),
  addOrientationChangeListener: jest.fn(() => ({ remove: jest.fn() })),
  removeOrientationChangeListener: jest.fn(),
}));

jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn(async () => {}),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactActual = require('react');
  const Icon = ({ name }: any) => ReactActual.createElement('span', { 'data-icon': name });
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('../utils/progress', () => ({
  getProgress: (...args: any[]) => mockGetProgress(...args),
  saveProgress: jest.fn(async () => {}),
}));

jest.mock('../utils/playerPreferences', () => ({
  getPlayerPreferences: (...args: any[]) => mockGetPlayerPreferences(...args),
  savePlayerPreferences: (...args: any[]) => mockSavePlayerPreferences(...args),
}));

jest.mock('../theme', () => ({
  useAppTheme: () => ({
    colors: { primary: '#E50914', onPrimary: '#FFFFFF' },
  }),
}));

const flushAsync = async (cycles = 8) => {
  for (let i = 0; i < cycles; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const findButtonByText = (container: HTMLElement, text: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll('button')).find((btn) =>
    (btn.textContent || '').includes(text),
  );

describe('Player screen loading, error, crash, and timeout recovery', () => {
  let container: HTMLDivElement;
  let root: any;

  beforeEach(() => {
    jest.useFakeTimers();
    latestWebViewProps = null;
    webViewMountCount = 0;
    mockRouteParams = {
      id: '438631',
      media_type: 'movie',
      title: 'Dune',
      poster: '/dune.jpg',
    };
    mockStopLoading.mockReset();
    mockInjectJavaScript.mockReset();
    mockRouterBack.mockReset();
    mockRouterReplace.mockReset();
    mockSavePlayerPreferences.mockClear();
    mockGetPlayerPreferences.mockClear();
    mockGetProgress.mockClear();

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  test('switchSource clears loader on onError, onHttpError, onRenderProcessGone, and onContentProcessDidTerminate and remounts on retry', async () => {
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    // Initially loading Vidy
    expect(container.textContent).toContain('Loading Vidy...');
    expect(latestWebViewProps?.source?.uri).toContain('https://www.vidy.st/movie/438631');
    expect(typeof latestWebViewProps?.renderError).toBe('function');

    // Complete initial load
    await act(async () => {
      latestWebViewProps.onLoad({ nativeEvent: { url: latestWebViewProps.source.uri } });
      latestWebViewProps.onLoadEnd();
    });
    expect(container.textContent).not.toContain('Loading Vidy...');

    // Switch source to VidLink
    const vidySwitchBtn = findButtonByText(container, 'Vidy');
    expect(vidySwitchBtn).toBeDefined();
    await act(async () => {
      vidySwitchBtn!.click();
    });
    await flushAsync();

    expect(container.textContent).toContain('Loading VidLink...');
    expect(latestWebViewProps?.source?.uri).toContain('https://vidlink.pro/movie/438631');

    // Simulate WebView network error + Android trailing onLoadEnd
    await act(async () => {
      latestWebViewProps.onError({
        nativeEvent: { code: -2, description: 'net::ERR_NAME_NOT_RESOLVED' },
      });
      latestWebViewProps.onLoadEnd();
    });

    expect(container.textContent).not.toContain('Loading VidLink...');
    expect(container.textContent).toContain('Unable to load VidLink');
    expect(container.textContent).toContain('net::ERR_NAME_NOT_RESOLVED');

    // Switch to Atlantic from error CTA -> triggers HTTP 502 error
    const switchAtlanticBtn = findButtonByText(container, 'Switch to Atlantic');
    expect(switchAtlanticBtn).toBeDefined();
    await act(async () => {
      switchAtlanticBtn!.click();
    });
    await flushAsync();

    expect(container.textContent).toContain('Loading Atlantic...');
    await act(async () => {
      latestWebViewProps.onHttpError({
        nativeEvent: { statusCode: 502, description: 'Bad Gateway' },
      });
      latestWebViewProps.onLoadEnd();
    });

    expect(container.textContent).not.toContain('Loading Atlantic...');
    expect(container.textContent).toContain('Unable to load Atlantic');
    expect(container.textContent).toContain('HTTP 502');

    // Switch to Movy -> triggers onRenderProcessGone
    const switchMovyBtn = findButtonByText(container, 'Switch to Movy');
    expect(switchMovyBtn).toBeDefined();
    await act(async () => {
      switchMovyBtn!.click();
    });
    await flushAsync();

    const mountsBeforeRetry = webViewMountCount;
    await act(async () => {
      latestWebViewProps.onRenderProcessGone({
        nativeEvent: { didCrash: true },
      });
    });

    expect(container.textContent).not.toContain('Loading Movy...');
    expect(container.textContent).toContain('Unable to load Movy');
    expect(container.textContent).toContain('crashed unexpectedly');

    // Retry remounts a brand-new WebView instance and shows loading again
    const retryBtn = findButtonByText(container, 'Retry');
    expect(retryBtn).toBeDefined();
    await act(async () => {
      retryBtn!.click();
    });
    expect(container.textContent).toContain('Loading Movy...');
    expect(webViewMountCount).toBe(mountsBeforeRetry + 1);

    // Simulate iOS WebContent termination during load
    await act(async () => {
      latestWebViewProps.onContentProcessDidTerminate();
    });
    expect(container.textContent).not.toContain('Loading Movy...');
    expect(container.textContent).toContain('Unable to load Movy');
    expect(container.textContent).toContain('terminated unexpectedly');
  });

  test('stalled stream switch times out after STREAM_LOAD_TIMEOUT_MS instead of spinning forever', async () => {
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    // Advance past timeout without onLoadEnd firing
    await act(async () => {
      jest.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS + 100);
    });

    expect(mockStopLoading).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Loading Vidy...');
    expect(container.textContent).toContain('Unable to load Vidy');
    expect(container.textContent).toContain('Timed out while loading Vidy');

    // User can recover via Switch to VidLink
    const switchVidLinkBtn = findButtonByText(container, 'Switch to VidLink');
    expect(switchVidLinkBtn).toBeDefined();
    await act(async () => {
      switchVidLinkBtn!.click();
    });
    await flushAsync();
    expect(container.textContent).toContain('Loading VidLink...');

    await act(async () => {
      latestWebViewProps.onLoad({ nativeEvent: { url: latestWebViewProps.source.uri } });
      latestWebViewProps.onLoadEnd();
    });
    expect(container.textContent).not.toContain('Loading VidLink...');
    expect(container.textContent).not.toContain('Unable to load');
  });

  test('invalid media id surfaces error immediately without spinning loader', async () => {
    mockRouteParams = { id: 'not-a-number', media_type: 'movie', title: 'Broken' };
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    expect(container.textContent).not.toContain('Loading Vidy...');
    expect(container.textContent).toContain('Unable to load Vidy');
    expect(container.textContent).toContain('Invalid media ID');
  });

  test('ignores about:blank onLoadEnd and handles Android onLoad-before-onError and post-timeout abort errors', async () => {
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    // about:blank onLoad + onLoadEnd must NOT clear loading or prevent timeout
    await act(async () => {
      latestWebViewProps.onLoad({ nativeEvent: { url: 'about:blank' } });
      latestWebViewProps.onLoadEnd({ nativeEvent: { url: 'about:blank' } });
    });
    expect(container.textContent).toContain('Loading Vidy...');

    // Real Android RNCWebViewClient error sequence: onLoad -> onLoadEnd -> onError -> onLoadEnd
    await act(async () => {
      latestWebViewProps.onLoad({ nativeEvent: { url: latestWebViewProps.source.uri } });
      latestWebViewProps.onLoadEnd({ nativeEvent: { url: latestWebViewProps.source.uri } });
      latestWebViewProps.onError({
        nativeEvent: { code: -2, description: 'net::ERR_NAME_NOT_RESOLVED' },
      });
      latestWebViewProps.onLoadEnd({ nativeEvent: { url: latestWebViewProps.source.uri } });
    });
    expect(container.textContent).not.toContain('Loading Vidy...');
    expect(container.textContent).toContain('Unable to load Vidy');
    expect(container.textContent).toContain('net::ERR_NAME_NOT_RESOLVED');

    // Switch to VidLink and time out; trailing onError from stopLoading() must keep timeout message
    const switchBtn = findButtonByText(container, 'Switch to VidLink');
    await act(async () => {
      switchBtn!.click();
    });
    await flushAsync();

    await act(async () => {
      jest.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS + 100);
    });
    await act(async () => {
      latestWebViewProps.onError({
        nativeEvent: { code: -3, description: 'net::ERR_ABORTED' },
      });
    });
    expect(container.textContent).toContain('Timed out while loading VidLink');
    expect(container.textContent).not.toContain('ERR_ABORTED');
  });

  test('recovers from stalled preference initialization via timeout and Retry/Switch', async () => {
    mockGetPlayerPreferences.mockImplementationOnce(() => new Promise(() => {}));
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    expect(container.textContent).toContain('Loading Vidy...');

    await act(async () => {
      jest.advanceTimersByTime(STREAM_LOAD_TIMEOUT_MS + 100);
    });

    expect(container.textContent).not.toContain('Loading Vidy...');
    expect(container.textContent).toContain('Timed out while loading Vidy');

    // Retry recovers even though initial getPlayerPreferences never resolved
    const retryBtn = findButtonByText(container, 'Retry');
    await act(async () => {
      retryBtn!.click();
    });
    await flushAsync();

    expect(container.textContent).toContain('Loading Vidy...');
    expect(latestWebViewProps?.source?.uri).toContain('https://www.vidy.st/movie/438631');
  });

  test('ignores late WebView process termination once user starts exiting', async () => {
    const Player = require('../../app/player').default;

    await act(async () => {
      root.render(React.createElement(Player));
    });
    await flushAsync();

    await act(async () => {
      latestWebViewProps.onLoad({ nativeEvent: { url: latestWebViewProps.source.uri } });
      latestWebViewProps.onLoadEnd({ nativeEvent: { url: latestWebViewProps.source.uri } });
    });

    // Tap Back button in HUD (first button in HUD)
    const backBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.querySelector('[data-icon="arrow-back"]'),
    );
    expect(backBtn).toBeDefined();
    await act(async () => {
      backBtn!.click();
    });

    // Simulate iOS destroyWebView firing onContentProcessDidTerminate while exiting
    await act(async () => {
      latestWebViewProps.onContentProcessDidTerminate();
    });
    expect(container.textContent).not.toContain('Unable to load');
  });
});
