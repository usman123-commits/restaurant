// Saved copies of the lists (Orders, Handoffs, Spend: the first page and the rows loaded with
// "Load more") and of the Dashboard's data in this browser's IndexedDB, so a page refresh
// shows them straight away, and a failed request still has something to show.
// The page still re-checks the server in the background, like before.
//
// - Only list responses are saved (see PERSIST_PATHS), nothing else.
// - Entries older than MAX_AGE_MS are dropped; at most MAX_ENTRIES are kept (oldest first out).
// - Everything is deleted on logout or when the session has expired (clearPersisted).
// - If IndexedDB is unavailable (private window, blocked storage) this silently does nothing.

const DB_NAME = 'otto-dashboard';
const STORE = 'cache';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;
const WRITE_DELAY_MS = 400;
const PERSIST_PATHS = ['/api/orders', '/api/handoffs', '/api/spend', '/api/analytics', '/api/insights'];

export const persistable = (url) => PERSIST_PATHS.some((p) => url === p || url.startsWith(`${p}?`));

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const d = await db();
  if (!d) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

// Writes are batched: the same key written many times in a row (polling) is saved once.
const pending = new Map(); // key -> value | null (null = delete)
let timer = null;
function flushSoon() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const batch = [...pending];
    pending.clear();
    run('readwrite', (store) => {
      for (const [key, value] of batch) {
        if (value === null) store.delete(key);
        else store.put({ value, savedAt: Date.now() }, key);
      }
    });
  }, WRITE_DELAY_MS);
}

export function persistSet(key, value) {
  pending.set(key, value);
  flushSoon();
}

export function persistDelete(key) {
  pending.set(key, null);
  flushSoon();
}

// Every saved entry still fresh enough: [{ key, value, savedAt }]. Drops old / extra ones.
export async function loadPersisted() {
  const all = await new Promise((resolve) => {
    run('readonly', (store) => {
      const out = [];
      const cur = store.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve(out);
        out.push({ key: c.key, value: c.value?.value, savedAt: c.value?.savedAt || 0 });
        c.continue();
      };
      cur.onerror = () => resolve(out);
      return cur;
    }).then((r) => { if (r === undefined) resolve([]); });
  });
  const now = Date.now();
  const sorted = all.sort((a, b) => b.savedAt - a.savedAt);
  const keep = sorted.filter((e) => now - e.savedAt < MAX_AGE_MS).slice(0, MAX_ENTRIES);
  const keepKeys = new Set(keep.map((e) => e.key));
  const drop = sorted.filter((e) => !keepKeys.has(e.key));
  if (drop.length) run('readwrite', (store) => drop.forEach((e) => store.delete(e.key)));
  return keep;
}

export function clearPersisted() {
  pending.clear();
  return run('readwrite', (store) => store.clear());
}
