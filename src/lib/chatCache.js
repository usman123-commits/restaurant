// Older messages loaded with "Load older", remembered per chat so going back to a
// chat doesn't make you load them again. The newest page is cached separately by
// useStaleData.
//
// Memory only (cleared on refresh / closing the tab; nothing in localStorage,
// sessionStorage or IndexedDB). Keeps the MAX_CHATS most recently opened chats;
// opening one more drops the one not looked at for longest.
//
// Old messages don't change, so a cached copy stays correct. The one exception
// is the "Reported" tag, which the chat page patches here when you report or
// undo, and which the quiet re-check on reopening refreshes from the server.

const MAX_CHATS = 30;
const chats = new Map(); // phone -> { messages, nextCursor }

export function getOlder(phone) {
  const entry = chats.get(phone);
  if (entry) {
    chats.delete(phone);
    chats.set(phone, entry); // most recently used
  }
  return entry || null;
}

export function setOlder(phone, entry) {
  chats.delete(phone);
  if (!entry || !entry.messages?.length) return;
  chats.set(phone, entry);
  while (chats.size > MAX_CHATS) chats.delete(chats.keys().next().value);
}
