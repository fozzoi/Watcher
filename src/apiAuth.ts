import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AxiosRequestConfig } from 'axios';

/**
 * Reads the cloud session token that `cloudSync` stores and turns it into an
 * `Authorization` header for the endpoints that are optionally authenticated.
 *
 * Why this exists
 * ───────────────
 * The API applies stricter per-identity rate limits and daily AI quotas to
 * signed-in callers, and it binds push-token rows to the account that claimed
 * them. None of that works if the client sends AI / push requests anonymously,
 * which is what it used to do even after a successful Google login.
 *
 * The token is cached briefly because AI screens can fire several requests in a
 * row and every AsyncStorage read is a bridge hop. It is never cached for
 * longer than a few seconds, and callers can drop the cache after login/logout
 * with `invalidateApiAuthCache()`.
 */

export const AUTH_TOKEN_STORAGE_KEY = 'cloud_auth_token';

const CACHE_TTL_MS = 15 * 1000;

let cachedToken: string | null = null;
let cachedAt = 0;
let cachePrimed = false;
let pendingRead: Promise<string | null> | null = null;

async function readToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
    cachedToken = token && token.trim() ? token.trim() : null;
  } catch {
    cachedToken = null;
  }
  cachedAt = Date.now();
  cachePrimed = true;
  return cachedToken;
}

/** Current bearer token, or null when the user is signed out. */
export async function getApiAuthToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
  const fresh = cachePrimed && options.forceRefresh !== true && Date.now() - cachedAt < CACHE_TTL_MS;
  if (fresh) return cachedToken;

  if (pendingRead) return pendingRead;

  pendingRead = readToken().finally(() => {
    pendingRead = null;
  });
  return pendingRead;
}

/**
 * Headers to spread into an axios request. Returns `{}` when signed out, so it
 * is always safe to merge into an existing header object.
 */
export async function getApiAuthHeaders(): Promise<Record<string, string>> {
  const token = await getApiAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Merge auth headers into an axios config without discarding caller headers. */
export async function withApiAuth(config: AxiosRequestConfig = {}): Promise<AxiosRequestConfig> {
  const headers = await getApiAuthHeaders();
  return {
    ...config,
    headers: { ...(config.headers || {}), ...headers },
  };
}

/** Call after login/logout so the next request re-reads storage. */
export function invalidateApiAuthCache(): void {
  cachedToken = null;
  cachedAt = 0;
  cachePrimed = false;
  pendingRead = null;
}
