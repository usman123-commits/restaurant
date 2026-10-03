import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models.js';

const router = Router();

// The n8n bot logs its own replies with role 'assistant' and profileName 'BOT'.
// Only customer messages carry the customer's real WhatsApp name.
const BOT_NAME = 'BOT';
const customerMessageMatch = {
  role: { $ne: 'assistant' },
  profileName: { $nin: ['', null, BOT_NAME] },
};

function clampLimit(raw, fallback, max) {
  const n = parseInt(raw ?? fallback, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

// Cursor = "<ISO timestamp>_<ObjectId>" of the oldest message the client already has.
// _id breaks ties so two messages with the same timestamp never get skipped.
function parseCursor(raw) {
  if (!raw) return null;
  const sep = raw.lastIndexOf('_');
  if (sep === -1) return null;
  const ts = new Date(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (isNaN(ts) || !mongoose.Types.ObjectId.isValid(id)) return null;
  return { ts, id: new mongoose.Types.ObjectId(id) };
}

async function customerNamesByPhone(phones) {
  if (!phones.length) return {};
  const rows = await Conversation.aggregate([
    { $match: { phone: { $in: phones }, ...customerMessageMatch } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$phone', profileName: { $first: '$profileName' } } },
  ]);
  return Object.fromEntries(rows.map((r) => [r._id, r.profileName]));
}

// GET /api/conversations?limit=20&offset=0
router.get('/', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit  || '20', 10);
    const offset = parseInt(req.query.offset || '0',  10);

    // Aggregate: group by phone, pick last message & count
    const agg = await Conversation.aggregate([
      { $sort: { timestamp: 1 } },
      {
        $group: {
          _id:           '$phone',
          lastMessage:   { $last: '$message' },
          lastTimestamp: { $last: '$timestamp' },
          messageCount:  { $sum: 1 },
        },
      },
      { $sort: { lastTimestamp: -1 } },
    ]);

    const total = agg.length;
    const pageRows = agg.slice(offset, offset + limit);
    const names = await customerNamesByPhone(pageRows.map((c) => c._id));

    const page = pageRows.map((c) => ({
      phone:         c._id,
      profileName:   names[c._id] || '',
      lastMessage:   c.lastMessage || '',
      lastTimestamp: c.lastTimestamp,
      messageCount:  c.messageCount,
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

    const filter = { phone };
    if (cursor) {
      filter.$or = [
        { timestamp: { $lt: cursor.ts } },
        { timestamp: cursor.ts, _id: { $lt: cursor.id } },
      ];
    }

    const [newestFirst, total, names] = await Promise.all([
      Conversation.find(filter).sort({ timestamp: -1, _id: -1 }).limit(limit + 1).lean(),
      Conversation.countDocuments({ phone }),
      customerNamesByPhone([phone]),
    ]);

    const hasMore = newestFirst.length > limit;
    const messages = newestFirst.slice(0, limit).reverse();
    const oldest = messages[0];
    const nextCursor = hasMore && oldest
      ? `${new Date(oldest.timestamp).toISOString()}_${oldest._id}`
      : null;

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
