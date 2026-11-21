// Conversations: older messages loaded with "Load older" (per chat) and the extra rows of the
// conversation list loaded with "Load more" (per search), remembered so going back doesn't
// make you load them again. The newest page of a chat and the first page of the list are
// cached separately by useStaleData.
//
// Kept in memory and saved in IndexedDB (lib/persist.js), so they also survive a refresh;
// restored on startup (restoreOlder / restoreListPages), deleted on logout.
// Keeps the MAX_CHATS most recently opened chats and MAX_LISTS searches.
//
// Old messages don't change, so a cached copy stays correct. The one exception
// is the "Reported" tag, which the chat page patches here when you report or
// undo, and which the quiet re-check on reopening refreshes from the server.
import { persistSet, persistDelete } from './persist';

const MAX_CHATS = 30;
const MAX_LISTS = 10;
const chats = new Map(); // phone -> { messages, nextCursor }
const lists = new Map(); // list url -> { url, items }

function touch(map, key) {
  const entry = map.get(key);
  if (entry) {
    map.delete(key);
    map.set(key, entry); // most recently used
  }
  return entry || null;
}

function put(map, key, entry, max, prefix, persist) {
  map.delete(key);
  map.set(key, entry);
  if (persist) persistSet(`${prefix}${key}`, entry);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    map.delete(oldest);
    persistDelete(`${prefix}${oldest}`);
  }
}

export function getOlder(phone) {
  return touch(chats, phone);
}

export function setOlder(phone, entry) {
  if (!entry || !entry.messages?.length) {
    chats.delete(phone);
    persistDelete(`older:${phone}`);
    return;
  }
  put(chats, phone, entry, MAX_CHATS, 'older:', true);
}

// conversation list: rows loaded with "Load more" for this list URL (search)
export function getListPages(url) {
  return touch(lists, url);
}

export function setListPages(url, items) {
  if (!items?.length) {
    lists.delete(url);
    persistDelete(`convlist:${url}`);
    return;
  }
  put(lists, url, { url, items }, MAX_LISTS, 'convlist:', true);
}

/** Startup: put saved copies (from IndexedDB) back. */
export function restoreOlder(phone, entry) {
  if (entry?.messages?.length && !chats.has(phone)) put(chats, phone, entry, MAX_CHATS, 'older:', false);
}

export function restoreListPages(entry) {
  if (entry?.url && entry.items?.length && !lists.has(entry.url)) put(lists, entry.url, entry, MAX_LISTS, 'convlist:', false);
}

/** Logout: forget everything held in memory. */
export function clearChatCache() {
  chats.clear();
  lists.clear();
}
