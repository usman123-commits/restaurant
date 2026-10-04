import { useState, useRef, useEffect, useCallback } from 'react';
import { useStaleData, seedCache } from './useStaleData';

const EMPTY = { url: null, items: [], nextCursor: null };

export function dedupeById(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it._id;
    if (key == null) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function withCursor(url, cursor) {
  return `${url}${url.includes('?') ? '&' : '?'}before=${encodeURIComponent(cursor)}`;
}

/**
 * usePagedList -- first page via stale-while-revalidate, further pages via "Load more".
 *
 * - The first page is cached per URL (so the filters must be part of `url`):
 *   revisiting or switching back to a filter shows data instantly, then revalidates.
 * - Extra pages are local state tagged with the URL they belong to; changing any
 *   filter (= a new URL) drops them automatically.
 * - When loading more, the current first page is snapshotted into the extra list.
 *   Otherwise a row pushed off the first page by a newer row (after revalidation)
 *   would fall into the gap between page 1 and page 2 and vanish.
 *
 * - While a new filter's first page is loading (`isPlaceholder`), the previous list
 *   stays on screen unchanged (including its "Load more" pages) and Load more is off.
 *
 * Server contract: `{ [itemsKey]: [...newest first], nextCursor }`, accepts `&before=<cursor>`.
 *
 * @returns {{ data, items, hasMore, loadMore, loadingMore, revalidating, isPlaceholder, revalidate, mutateItems }}
 */
export function usePagedList(url, itemsKey, options) {
  const { data, revalidating, isPlaceholder, revalidate } = useStaleData(url, options);
  const [extra, setExtra] = useState(EMPTY);
  const [loadingMore, setLoadingMore] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  const extraActive = extra.url === url;
  const firstItems = data?.[itemsKey] || [];
  // First page wins on duplicates: it's the freshest copy (e.g. after a status change).
  const freshItems = dedupeById([...firstItems, ...(extraActive ? extra.items : [])]);

  // Keep the last real list on screen while a new filter loads.
  const lastItems = useRef(freshItems);
  if (!isPlaceholder) lastItems.current = freshItems;
  const items = isPlaceholder ? lastItems.current : freshItems;
  const nextCursor = isPlaceholder ? null : (extraActive ? extra.nextCursor : (data?.nextCursor ?? null));

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const requestUrl = url;
    setLoadingMore(true);
    try {
      const res = await fetch(withCursor(requestUrl, nextCursor), { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = await res.json();
      if (urlRef.current !== requestUrl) return; // filters changed mid-flight
      setExtra({
        url: requestUrl,
        items: dedupeById([...items, ...(page[itemsKey] || [])]),
        nextCursor: page.nextCursor || null,
      });
    } catch {
      /* keep what we have; the button stays available to retry */
    } finally {
      setLoadingMore(false);
    }
  };

  // Apply a local change (status update, delete) to rows held outside the cache.
  const mutateItems = useCallback((fn) => {
    setExtra((prev) => (prev.url ? { ...prev, items: fn(prev.items) } : prev));
  }, []);

  return { data, items, hasMore: Boolean(nextCursor), loadMore, loadingMore, revalidating, isPlaceholder, revalidate, mutateItems };
}

/**
 * Pre-fill the cache for sibling views (e.g. every Orders tab) with ONE batch request,
 * so the first click on any of them is instant.
 *
 * @param {string|null} batchUrl  - Endpoint returning `{ [key]: payload }`. Re-runs when it changes.
 * @param {(key: string) => string} urlForKey - The exact URL the page would request for that key
 *   (must match what it passes to usePagedList, or the cache entry is never used).
 */
export function usePrefetchInto(batchUrl, urlForKey) {
  const urlForKeyRef = useRef(urlForKey);
  urlForKeyRef.current = urlForKey;
  useEffect(() => {
    if (!batchUrl) return undefined;
    let cancelled = false;
    const startedAt = Date.now();
    fetch(batchUrl, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((batch) => {
        if (cancelled || !batch) return;
        Object.entries(batch).forEach(([key, payload]) => seedCache(urlForKeyRef.current(key), payload, startedAt));
      })
      .catch(() => { /* prefetch is best-effort */ });
    return () => { cancelled = true; };
  }, [batchUrl]);
}

/** Value that only updates after `delay` ms without changes (for search boxes). */
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** [from, to) ISO instants for a local calendar day 'YYYY-MM-DD'. */
export function localDayRange(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { from: new Date(y, m - 1, d).toISOString(), to: new Date(y, m - 1, d + 1).toISOString() };
}

/** Build `/path?k=v` skipping empty values, with stable key order (= stable cache key). */
export function buildUrl(path, params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
