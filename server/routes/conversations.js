import { Router } from 'express';
import { Conversation } from '../models.js';

const router = Router();

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
          profileName:   { $last: '$profileName' },
          lastMessage:   { $last: '$message' },
          lastTimestamp: { $last: '$timestamp' },
          messageCount:  { $sum: 1 },
        },
      },
      { $sort: { lastTimestamp: -1 } },
    ]);

    const total = agg.length;
    const page  = agg.slice(offset, offset + limit).map((c) => ({
      phone:         c._id,
      profileName:   c.profileName || '',
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

// GET /api/conversations/:phone?limit=50
router.get('/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit || '50', 10);

    const total = await Conversation.countDocuments({ phone });
    if (total === 0) {
      return res.json({ messages: [], total: 0, hasMore: false, profileName: phone });
    }

    // Get the last `limit` messages in chronological order
    const messages = await Conversation.find({ phone })
      .sort({ timestamp: 1 })
      .skip(Math.max(0, total - limit))
      .lean();

    const profileName = messages.find((m) => m.profileName)?.profileName || phone;

    res.json({ messages, total, hasMore: total > limit, profileName });
  } catch (err) {
    console.error('Error fetching conversation:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

export default router;
