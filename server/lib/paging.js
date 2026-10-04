import mongoose from 'mongoose';

// Keyset ("cursor") pagination over { timestamp: -1, _id: -1 }.
// Unlike skip/offset, new rows arriving at the top never shift pages, so
// "Load more" can't show duplicates or skip rows.

export function clampLimit(raw, fallback, max) {
  const n = parseInt(raw ?? fallback, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Cursor = "<ISO timestamp>_<ObjectId>" of the last row the client already has.
export function parseCursor(raw) {
  if (!raw) return null;
  const sep = raw.lastIndexOf('_');
  if (sep === -1) return null;
  const ts = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (isNaN(ts) || !mongoose.Types.ObjectId.isValid(id)) return null;
  return { ts, id: new mongoose.Types.ObjectId(id) };
}

export function makeCursor(doc) {
  return `${new Date(doc.timestamp).toISOString()}_${doc._id}`;
}

// Rows strictly older than the cursor. _id breaks timestamp ties.
export function olderThan(cursor) {
  if (!cursor) return null;
  return {
    $or: [
      { timestamp: { $lt: cursor.ts } },
      { timestamp: cursor.ts, _id: { $lt: cursor.id } },
    ],
  };
}

// Fetch one page newest-first. Returns { items, hasMore, nextCursor }.
export async function fetchPage(Model, filter, { limit, cursor }) {
  const clauses = [filter, olderThan(cursor)].filter((c) => c && Object.keys(c).length);
  const query = clauses.length > 1 ? { $and: clauses } : (clauses[0] || {});
  const rows = await Model.find(query).sort({ timestamp: -1, _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return { items, hasMore, nextCursor: hasMore ? makeCursor(items[items.length - 1]) : null };
}

// [from, to) time range from ISO strings. The client computes local-day
// boundaries, because the server (UTC on Vercel) doesn't know the user's timezone.
export function timeRange(from, to) {
  const range = {};
  const f = from ? new Date(from) : null;
  const t = to ? new Date(to) : null;
  if (f && !isNaN(f)) range.$gte = f;
  if (t && !isNaN(t)) range.$lt = t;
  return Object.keys(range).length ? { timestamp: range } : null;
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Case-insensitive "contains" across fields. Input is escaped and capped so a
// search box can't inject regex syntax or send a pathological pattern.
export function searchFilter(q, fields) {
  const term = String(q || '').trim().slice(0, 100);
  if (!term) return null;
  const re = new RegExp(escapeRegex(term), 'i');
  return { $or: fields.map((f) => ({ [f]: re })) };
}

export function and(...clauses) {
  const parts = clauses.filter((c) => c && Object.keys(c).length);
  if (parts.length === 0) return {};
  return parts.length === 1 ? parts[0] : { $and: parts };
}
