// Shared helpers for the Conversations list and chat page.

// ---- Read state remembered in this tab -------------------------------------
// The server is the source of truth ("read up to" per phone). This map only covers
// the moment between marking a chat read and the cached list refreshing, so going
// back to the list never flashes an old unread badge.
const readLocally = new Map(); // phone -> ms timestamp

export function markReadLocally(phone, at) {
  const t = new Date(at).getTime();
  if (!isNaN(t) && t > (readLocally.get(phone) || 0)) readLocally.set(phone, t);
}

export function localReadAt(phone) {
  return readLocally.get(phone) || 0;
}

// ---- Dates -----------------------------------------------------------------
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayKey(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? '' : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// WhatsApp-style day label: Today / Yesterday / Monday (last week) / 12 September (2025)
export function dayLabel(dateStr, now = new Date()) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

export function timeOfDay(dateStr) {
  const d = new Date(dateStr);
  return isNaN(d) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
