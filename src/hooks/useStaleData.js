import { useState, useEffect, useRef } from "react";
import { persistable, persistSet, persistDelete } from "../lib/persist";

/**
 * Module-level in-memory cache -- survives component unmount/remount
 * but resets on full page refresh (intentional: keeps data fresh).
 * List responses (Orders, Handoffs, Spend) are also saved to IndexedDB (lib/persist.js) and
 * put back here on startup (restoreCache), so a refresh shows them instantly; everything
 * else is memory only.
 *
 * Shape: Map<key, { data: any, fetchedAt: number }>
 *
 * Capped at MAX_ENTRIES, least recently used first out, so a tab left open all day
 * (every filter, page and chat ever opened is a key) doesn't keep growing.
 */
const MAX_ENTRIES = 200;
// A failed request is retried after these delays before the page is told it failed.
const RETRY_DELAYS_MS = [1000, 3000, 8000];
const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (entry) {
    // move to the end = most recently used
    cache.delete(key);
    cache.set(key, entry);
  }
  return entry;
}

function cacheSet(key, entry, { persist = true } = {}) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  if (persist && persistable(key)) persistSet(`page1:${key}`, entry);
}

/** Startup: put a saved copy (from IndexedDB) back into the cache. */
export function restoreCache(url, entry) {
  if (entry?.data != null && !cache.has(url)) cacheSet(url, entry, { persist: false });
}

/** Logout: forget everything held in memory. */
export function clearMemoryCache() {
  cache.clear();
}

/**
 * useStaleData -- Stale-While-Revalidate hook.
 *
 * On mount:
 *   - If cache has data for `url`, immediately returns it (no spinner).
 *   - Simultaneously fires a background fetch to revalidate.
 *
 * When `url` changes (e.g. a filter):
 *   - Cached -> switch to it instantly.
 *   - Not cached -> keep showing the previous URL's data with `isPlaceholder: true`
 *     until the new data arrives, so the page never blanks out. Pages should dim
 *     placeholder data and show a small loading indicator.
 *
 * On every poll cycle:
 *   - Returns stale data instantly, updates silently when fresh data arrives.
 *
 * @param {string}   url           - The API endpoint to fetch.
 * @param {object}   [options]
 * @param {number}   [options.pollInterval]  - Auto-refresh interval in ms (0 = no polling).
 *                                           Paused while the browser tab is hidden.
 * @param {function} [options.transform]     - Optional transform applied to raw JSON before storing.
 * @returns {{ data: any, revalidating: boolean, isPlaceholder: boolean, failed: boolean, revalidate: function }}
 *   revalidating  - true only while there is no data at all to show (first ever load,
 *                   including the quiet retries after a failed request).
 *   failed        - the last request failed even after the retries; `data` may still be an
 *                   older copy (memory / IndexedDB) or null.
 *   isPlaceholder - true while `data` still belongs to a previous URL.
 */
export function useStaleData(url, { pollInterval = 0, transform } = {}) {
  const cached = cacheGet(url);

  // `shown.url` is the URL that `shown.data` belongs to.
  const [shown, setShown] = useState(() => ({ url, data: cached?.data ?? null }));
  // URL whose first fetch has finished (successfully or not).
  const [settledUrl, setSettledUrl] = useState(cached ? url : null);
  const isMounted = useRef(true);
  const currentUrl = useRef(url);

  // URL changed and we have it cached: show it right away (during render, so the
  // previous URL's rows never flash). Not cached: keep the previous data as placeholder.
  if (shown.url !== url && cached) {
    setShown({ url, data: cached.data });
  }

  // URL whose last fetch failed (after the retries); cleared by the next success.
  const [failedUrl, setFailedUrl] = useState(null);

  // attempt: 0 = the normal request; failures are retried after RETRY_DELAYS_MS.
  const fetchData = async (attempt = 0) => {
    const requestUrl = url;
    const stillHere = () => isMounted.current && currentUrl.current === requestUrl;
    try {
      // no-store: never let the browser turn this into a "changed since?" request that comes
      // back as a bodiless 304 -- this hook is the cache.
      const res = await fetch(requestUrl, { credentials: "include", cache: "no-store" });
      let result;
      if (res.status === 304 && cache.get(requestUrl)) {
        // "not changed": what we hold is still right
        result = cache.get(requestUrl).data;
      } else {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        result = transform ? transform(json) : json;
      }

      cacheSet(requestUrl, { data: result, fetchedAt: Date.now() });

      // Ignore responses for a URL we've already moved away from.
      if (stillHere()) {
        setShown({ url: requestUrl, data: result });
        setSettledUrl(requestUrl);
        setFailedUrl(null);
      }
    } catch {
      if (!stillHere()) return;
      // Keep whatever we hold for this URL (memory / IndexedDB copy) on screen.
      // Don't leave the previous filter's rows on screen as if they were the answer.
      setShown({ url: requestUrl, data: cache.get(requestUrl)?.data ?? null });
      if (attempt < RETRY_DELAYS_MS.length) {
        // try again quietly (slow cold start, a dropped connection); the loading view stays
        setTimeout(() => { if (stillHere()) fetchData(attempt + 1); }, RETRY_DELAYS_MS[attempt]);
        return;
      }
      setSettledUrl(requestUrl);
      setFailedUrl(requestUrl);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    currentUrl.current = url;

    // Always revalidate in background on mount
    fetchData();

    // Polling: skip while the browser tab is hidden (no point refreshing a page
    // nobody sees) and catch up immediately when it becomes visible again.
    let timer;
    const poll = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    if (pollInterval > 0) {
      timer = setInterval(poll, pollInterval);
      document.addEventListener("visibilitychange", poll);
    }

    return () => {
      isMounted.current = false;
      if (timer) {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", poll);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pollInterval]);

  // failed: the request failed (after the retries) -- data may still hold an older copy
  const failed = failedUrl === url;
  const isPlaceholder = shown.url !== url && shown.data != null;
  const revalidating = shown.data == null && settledUrl !== url;
  const revalidate = () => fetchData(0);
  return { data: shown.data, revalidating, isPlaceholder, failed, revalidate };
}

/** Manually invalidate a cache entry (call after mutations). */
export function invalidateCache(url) {
  cache.delete(url);
  if (persistable(url)) persistDelete(`page1:${url}`);
}

/**
 * Put data fetched elsewhere (e.g. a batch "prefetch all tabs" request) into the
 * cache under `url`, unless the cache already holds something newer.
 * `fetchedAt` = when that batch request was started.
 */
export function seedCache(url, data, fetchedAt) {
  const existing = cache.get(url);
  if (!existing || existing.fetchedAt < fetchedAt) cacheSet(url, { data, fetchedAt });
}
