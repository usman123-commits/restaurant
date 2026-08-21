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
 * On every poll cycle:
 *   - Returns stale data instantly, updates silently when fresh data arrives.
 *
 * @param {string}   url           - The API endpoint to fetch.
 * @param {object}   [options]
 * @param {number}   [options.pollInterval]  - Auto-refresh interval in ms (0 = no polling).
 * @param {function} [options.transform]     - Optional transform applied to raw JSON before storing.
 * @returns {{ data: any, revalidating: boolean, revalidate: function }}
 */
export function useStaleData(url, { pollInterval = 0, transform } = {}) {
  const cached = cache.get(url);

  const [data, setData] = useState(cached?.data ?? null);
  // revalidating=true only when there is NO cached data yet (very first load)
  const [revalidating, setRevalidating] = useState(!cached);
  const isMounted = useRef(true);

  const fetchData = async () => {
    try {
      const res = await fetch(url, { credentials: "include" });
      const json = await res.json();
      const result = transform ? transform(json) : json;

      cache.set(url, { data: result, fetchedAt: Date.now() });

      if (isMounted.current) {
        setData(result);
        setRevalidating(false);
      }
    } catch {
      if (isMounted.current) setRevalidating(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;

    // Always revalidate in background on mount
    fetchData();

    let timer;
    if (pollInterval > 0) {
      timer = setInterval(fetchData, pollInterval);
    }

    return () => {
      isMounted.current = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { data, revalidating, revalidate: fetchData };
}

/** Manually invalidate a cache entry (call after mutations). */
export function invalidateCache(url) {
  cache.delete(url);
}
