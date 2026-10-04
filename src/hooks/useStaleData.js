import { useState, useEffect, useRef } from "react";

/**
 * Module-level in-memory cache -- survives component unmount/remount
 * but resets on full page refresh (intentional: keeps data fresh).
 *
 * Shape: Map<key, { data: any, fetchedAt: number }>
 */
const cache = new Map();

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
 * @returns {{ data: any, revalidating: boolean, isPlaceholder: boolean, revalidate: function }}
 *   revalidating  - true only while there is no data at all to show (first ever load).
 *   isPlaceholder - true while `data` still belongs to a previous URL.
 */
export function useStaleData(url, { pollInterval = 0, transform } = {}) {
  const cached = cache.get(url);

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

  const fetchData = async () => {
    const requestUrl = url;
    try {
      const res = await fetch(requestUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const result = transform ? transform(json) : json;

      cache.set(requestUrl, { data: result, fetchedAt: Date.now() });

      // Ignore responses for a URL we've already moved away from.
      if (isMounted.current && currentUrl.current === requestUrl) {
        setShown({ url: requestUrl, data: result });
        setSettledUrl(requestUrl);
      }
    } catch {
      if (isMounted.current && currentUrl.current === requestUrl) {
        // Don't leave the previous filter's rows on screen as if they were the answer.
        setShown({ url: requestUrl, data: cache.get(requestUrl)?.data ?? null });
        setSettledUrl(requestUrl);
      }
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

  const isPlaceholder = shown.url !== url && shown.data != null;
  const revalidating = shown.data == null && settledUrl !== url;
  return { data: shown.data, revalidating, isPlaceholder, revalidate: fetchData };
}

/** Manually invalidate a cache entry (call after mutations). */
export function invalidateCache(url) {
  cache.delete(url);
}

/**
 * Put data fetched elsewhere (e.g. a batch "prefetch all tabs" request) into the
 * cache under `url`, unless the cache already holds something newer.
 * `fetchedAt` = when that batch request was started.
 */
export function seedCache(url, data, fetchedAt) {
  const existing = cache.get(url);
  if (!existing || existing.fetchedAt < fetchedAt) cache.set(url, { data, fetchedAt });
}
