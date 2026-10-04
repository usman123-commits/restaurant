import { Router } from 'express';
import { Conversation } from '../models.js';
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

    // Names and message counts only for the 20 phones on this page.
    const [names, countRows] = await Promise.all([
      customerNamesByPhone(phones),
      phones.length
        ? Conversation.aggregate([
            { $match: { phone: { $in: phones } } },
            { $group: { _id: '$phone', n: { $sum: 1 } } },
          ])
        : [],
    ]);
    const counts = Object.fromEntries(countRows.map((r) => [r._id, r.n]));

    const page = pageRows.map((c) => ({
      phone:         c._id,
      profileName:   names[c._id] || '',
      lastMessage:   c.lastMessage || '',
      lastTimestamp: c.lastTimestamp,
      messageCount:  counts[c._id] || 0,
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

    const [page, total, names] = await Promise.all([
      fetchPage(Conversation, { phone }, { limit, cursor }),
      Conversation.countDocuments({ phone }),
      customerNamesByPhone([phone]),
    ]);

    const messages = page.items.reverse();
    const { hasMore, nextCursor } = page;

    res.json({
      messages,
      total,
      hasMore,
      nextCursor,
      profileName: names[phone] || phone,
    });
  } catch (err) {
    console.error('Error fetching conversation:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

export default router;
