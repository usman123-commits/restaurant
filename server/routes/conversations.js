import { Router } from 'express';
import { Conversation } from '../models.js';
import { clampLimit, parseCursor, fetchPage } from '../lib/paging.js';

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
