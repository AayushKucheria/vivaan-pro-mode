/**
 * Simple in-memory cache with TTL for API routes.
 *
 * NOTE: This works well for long-running servers (e.g., `npm run dev` or
 * a persistent Node process). On serverless platforms like Vercel, each
 * function invocation may get a fresh instance, so the cache may not persist
 * across cold starts. For true persistence, consider Redis or a database.
 */

const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // 21,600,000 ms

interface CacheEntry<T> {
  data: T;
  lastUpdated: number; // timestamp in ms
  refreshPromise: Promise<T> | null; // tracks in-flight refresh
}

// Global cache store, keyed by a string identifier
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Get cached data if it exists and is still fresh.
 * Returns null if cache is missing or stale.
 */
export function getCached<T>(key: string, ttlMs: number = SIX_HOURS_MS): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  const age = Date.now() - entry.lastUpdated;
  if (age > ttlMs) return null; // stale

  return entry.data;
}

/**
 * Get the timestamp of when the cache was last updated.
 * Returns null if no cache entry exists.
 */
export function getCacheTimestamp(key: string): number | null {
  const entry = cache.get(key);
  return entry ? entry.lastUpdated : null;
}

/**
 * Store data in the cache with the current timestamp.
 */
export function setCached<T>(key: string, data: T): void {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  cache.set(key, {
    data,
    lastUpdated: Date.now(),
    refreshPromise: existing?.refreshPromise ?? null,
  });
}

/**
 * Stale-while-revalidate pattern:
 * - If cache is fresh, return cached data immediately.
 * - If cache is stale (or missing), call refreshFn to get new data.
 * - If a refresh is already in progress, wait for it instead of starting another.
 *
 * Returns { data, lastUpdated } so callers can report when data was generated.
 */
export async function getOrRefresh<T>(
  key: string,
  refreshFn: () => Promise<T>,
  ttlMs: number = SIX_HOURS_MS
): Promise<{ data: T; lastUpdated: number }> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  // Fresh cache hit
  if (entry && now - entry.lastUpdated <= ttlMs) {
    return { data: entry.data, lastUpdated: entry.lastUpdated };
  }

  // Stale or missing – need to refresh
  // If a refresh is already in progress, wait for it
  if (entry?.refreshPromise) {
    const data = await entry.refreshPromise;
    const updatedEntry = cache.get(key) as CacheEntry<T>;
    return { data, lastUpdated: updatedEntry?.lastUpdated ?? now };
  }

  // Start a new refresh
  const refreshPromise = refreshFn();

  // Store the promise so concurrent requests can wait on it
  if (entry) {
    entry.refreshPromise = refreshPromise;
  } else {
    cache.set(key, {
      data: null as T, // placeholder until refresh completes
      lastUpdated: 0,
      refreshPromise,
    });
  }

  try {
    const data = await refreshPromise;
    cache.set(key, {
      data,
      lastUpdated: Date.now(),
      refreshPromise: null,
    });
    return { data, lastUpdated: Date.now() };
  } catch (error) {
    // Clear the promise so future requests can retry
    const currentEntry = cache.get(key) as CacheEntry<T> | undefined;
    if (currentEntry) {
      currentEntry.refreshPromise = null;
    }

    // If we have stale data, return it rather than failing
    if (entry && entry.data !== null) {
      return { data: entry.data, lastUpdated: entry.lastUpdated };
    }

    throw error; // No cached data to fall back on
  }
}

export const DEFAULT_TTL = SIX_HOURS_MS;
