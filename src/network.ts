/**
 * Connectivity monitor.
 *
 * The request layer uses this to fail fast when the device is actually
 * offline. Without it, every queued TMDB call burns its full timeout before
 * giving up, so a phone in a dead spot "loads" for a minute instead of showing
 * cached data immediately.
 *
 * Two deliberate safety properties:
 *
 * 1. The native module is loaded lazily inside a try/catch. `@react-native-community/netinfo`
 *    throws at import time when its native side is missing, so a static import
 *    would crash any build made before this dependency was added. Loading it on
 *    demand keeps such builds running in "assume online" mode.
 * 2. Everything fails open. Unknown reachability is treated as online, so the
 *    fast-fail path can never block a connection that actually works.
 */

type NetInfoStateLike = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type NetInfoModule = {
  addEventListener: (listener: (state: NetInfoStateLike) => void) => () => void;
};

type NetworkListener = (online: boolean) => void;

let initialized = false;
let online = true;
let detachNetInfo: (() => void) | null = null;
const listeners = new Set<NetworkListener>();

// `undefined` = not tried yet, `null` = unavailable in this build.
let netInfoModule: NetInfoModule | null | undefined;

const loadNetInfo = (): NetInfoModule | null => {
  if (netInfoModule !== undefined) return netInfoModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require('@react-native-community/netinfo');
    netInfoModule = (loaded?.default ?? loaded) as NetInfoModule;
  } catch {
    netInfoModule = null;
  }
  return netInfoModule;
};

const emit = (next: boolean) => {
  if (next === online) return;
  online = next;
  for (const listener of Array.from(listeners)) {
    try {
      listener(next);
    } catch {
      // A misbehaving listener must not break connectivity tracking.
    }
  }
};

const applyState = (state: NetInfoStateLike) => {
  // `isInternetReachable` stays null until the first probe resolves; treat
  // unknown as online so a working connection is never blocked.
  emit(state.isConnected !== false && state.isInternetReachable !== false);
};

export const initNetworkMonitor = (): void => {
  if (initialized) return;
  initialized = true;

  const netInfo = loadNetInfo();
  if (!netInfo) {
    online = true;
    return;
  }

  try {
    detachNetInfo = netInfo.addEventListener(applyState);
  } catch {
    // Native module unusable — assume online.
    online = true;
  }
};

export const isKnownOffline = (): boolean => {
  initNetworkMonitor();
  return online === false;
};

export const subscribeToNetwork = (listener: NetworkListener): (() => void) => {
  initNetworkMonitor();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: drops the subscription and restores the assumed-online state. */
export const resetNetworkMonitorForTests = (): void => {
  try {
    detachNetInfo?.();
  } catch {
    // ignore
  }
  detachNetInfo = null;
  listeners.clear();
  initialized = false;
  online = true;
  netInfoModule = undefined;
};
