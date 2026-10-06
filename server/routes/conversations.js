import { Router } from 'express';
import { Conversation, Feedback, ConversationRead, BotConfig } from '../models.js';
import { clampLimit, parseCursor, fetchPage, escapeRegex } from '../lib/paging.js';

const router = Router();

// The n8n bot logs its own replies with role 'assistant' and profileName 'BOT'.
// Only customer messages carry the customer's real WhatsApp name.
const BOT_NAME = 'BOT';
const customerMessageMatch = {
  role: { $ne: 'assistant' },
  profileName: { $nin: ['', null, BOT_NAME] },
};

async function customerNamesByPhone(phones) {
  if (!phones.length) return {};
  const rows = await Conversation.aggregate([
    { $match: { phone: { $in: phones }, ...customerMessageMatch } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$phone', profileName: { $first: '$profileName' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.profileName]));
}

// ---- Unread ("seen up to" per phone) ----

// When unread tracking started. Set once, on first use, so a fresh deploy doesn't
// flag every message ever logged as unread.
let unreadSinceCache = null;
async function unreadSince() {
  if (unreadSinceCache) return unreadSinceCache;
  const now = new Date().toISOString();
  const doc = await BotConfig.findOneAndUpdate(
    { key: 'UNREAD_SINCE' },
    { $setOnInsert: { key: 'UNREAD_SINCE', value: now } },
    { upsert: true, returnDocument: 'after' }
  ).lean();
  const t = new Date(doc?.value || now);
  unreadSinceCache = isNaN(t) ? new Date(now) : t;
  return unreadSinceCache;
}

// { phone: Date } -- effective "read up to" for each phone.
async function lastReadByPhone(phones) {
  if (!phones.length) return {};
  const [since, rows] = await Promise.all([
    unreadSince(),
    ConversationRead.find({ phone: { $in: phones } }, { phone: 1, lastReadAt: 1 }).lean(),
  ]);
  const map = Object.fromEntries(phones.map((p) => [p, since]));
  for (const r of rows) if (r.lastReadAt > map[r.phone]) map[r.phone] = r.lastReadAt;
  return map;
}

// { phone: n } -- customer messages newer than each phone's read point.
async function unreadCounts(readMap) {
  const phones = Object.keys(readMap);
  if (!phones.length) return {};
  const rows = await Conversation.aggregate([
    { $match: { $or: phones.map((p) => ({ phone: p, timestamp: { $gt: readMap[p] } })), ...customerMessageMatch } },
    { $group: { _id: '$phone', n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

// Phones whose number or customer name contains `q` (null = no search).
async function phonesMatching(q) {
  const term = String(q || '').trim().slice(0, 100);
  if (!term) return null;
  const re = new RegExp(escapeRegex(term), 'i');
  const byName = await Conversation.distinct('phone', { ...customerMessageMatch, profileName: re });
  return { $or: [{ phone: re }, { phone: { $in: byName } }] };
}

// GET /api/conversations?limit=20&offset=0&q=
router.get('/', async (req, res) => {
  try {
    const limit  = clampLimit(req.query.limit, 20, 100);
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);
    const match  = await phonesMatching(req.query.q);

    // Latest message per phone. Sorting on the { phone, timestamp } index lets
    // MongoDB jump to the newest message of each phone (DISTINCT_SCAN) instead of
    // reading and sorting every message ever logged.
    const [agg] = await Conversation.aggregate([
      ...(match ? [{ $match: match }] : []),
      { $sort: { phone: 1, timestamp: -1, _id: -1 } },
      {
        $group: {
          _id:           '$phone',
          lastMessage:   { $first: '$message' },
          lastTimestamp: { $first: '$timestamp' },
        },
      },
      { $sort: { lastTimestamp: -1, _id: 1 } },
      {
        $facet: {
          page:  [{ $skip: offset }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    const pageRows = agg?.page || [];
    const total = agg?.total?.[0]?.n || 0;
    const phones = pageRows.map((c) => c._id);

    // Names, message counts and unread counts only for the 20 phones on this page.
    const readMap = await lastReadByPhone(phones);
    const [names, countRows, unread] = await Promise.all([
      customerNamesByPhone(phones),
      phones.length
        ? Conversation.aggregate([
            { $match: { phone: { $in: phones } } },
            { $group: { _id: '$phone', n: { $sum: 1 } } },
          ])
        : [],
      unreadCounts(readMap),
    ]);
    const counts = Object.fromEntries(countRows.map((r) => [r._id, r.n]));

    const page = pageRows.map((c) => ({
      phone:         c._id,
      profileName:   names[c._id] || '',
      lastMessage:   c.lastMessage || '',
      lastTimestamp: c.lastTimestamp,
      messageCount:  counts[c._id] || 0,
      unread:        unread[c._id] || 0,
    }));

    res.json({ conversations: page, total, hasMore: offset + limit < total });
  } catch (err) {
    console.error('Error fetching conversations:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// GET /api/conversations/:phone?limit=20&before=<cursor>
// Returns the newest `limit` messages older than `before` (or the newest overall),
// in chronological order, plus `nextCursor` for loading the page before that.
router.get('/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = clampLimit(req.query.limit, 20, 100);
    const cursor = parseCursor(req.query.before);

    const [page, total, names, readMap] = await Promise.all([
      fetchPage(Conversation, { phone }, { limit, cursor }),
      Conversation.countDocuments({ phone }),
      customerNamesByPhone([phone]),
      lastReadByPhone([phone]),
    ]);
    // Read point and unread count as they were BEFORE this visit, so the page can draw the
    // "N unread messages" divider; the page then marks the conversation read (POST /read).
    const unread = cursor ? null : (await unreadCounts(readMap))[phone] || 0;

    const messages = page.items.reverse();
    const { hasMore, nextCursor } = page;
    // bot replies reported as wrong on this page (Report button)
    const reports = await Feedback.find({ conversationId: { $in: messages.map((m) => String(m._id)) } }, { conversationId: 1, note: 1 }).lean();
    const reported = new Map(reports.map((r) => [r.conversationId, r.note]));
    for (const m of messages) {
      if (reported.has(String(m._id))) m.report = { note: reported.get(String(m._id)) };
    }

    res.json({
      messages,
      total,
      hasMore,
      nextCursor,
      profileName: names[phone] || phone,
      lastReadAt: readMap[phone],
      ...(unread !== null && { unread }),
    });
  } catch (err) {
    console.error('Error fetching conversation:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// POST /api/conversations/:phone/read { upTo: <ISO time of the newest message on screen> }
// Marks the conversation read up to that message. Never moves the read point backwards,
// and never past "now" (so a wrong client clock can't hide future messages).
router.post('/:phone/read', async (req, res) => {
  try {
    const { phone } = req.params;
    const now = new Date();
    let upTo = new Date(req.body?.upTo ?? now);
    if (isNaN(upTo) || upTo > now) upTo = now;
    // $max only ever moves lastReadAt forward (and sets it on a new row).
    await ConversationRead.updateOne({ phone }, { $max: { lastReadAt: upTo } }, { upsert: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking conversation read:', err.message);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

export default router;
