import { loadPersisted, clearPersisted } from './persist';
import { restoreCache, clearMemoryCache } from '../hooks/useStaleData';
import { restorePages, clearMemoryPages } from '../hooks/usePagedList';

// Startup: put the lists saved in IndexedDB back into the in-memory caches before the app
// draws, so Orders / Handoffs / Spend appear instantly after a refresh. Gives up after
// `waitMs` (slow disk): the app then just loads from the server as usual.
export async function restoreSavedLists(waitMs = 400) {
  const load = loadPersisted().then((entries) => {
    for (const { key, value } of entries) {
      if (key.startsWith('page1:')) restoreCache(key.slice(6), value);
      else if (key.startsWith('more:')) restorePages(value);
    }
  }).catch(() => {});
  await Promise.race([load, new Promise((r) => setTimeout(r, waitMs))]);
}

// Logout or expired session: nothing from this account stays in memory or on this device.
export function forgetSavedLists() {
  clearMemoryCache();
  clearMemoryPages();
  return clearPersisted();
}
