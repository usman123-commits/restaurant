import { Router } from 'express';
import { getSheetData } from '../sheets.js';

const router = Router();

// GET /api/conversations?limit=20&offset=0
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const offset = parseInt(req.query.offset || '0', 10);

    const rows = await getSheetData('Conversations', 'A:F');
    if (rows.length < 2) {
      return res.json({ conversations: [], total: 0, hasMore: false });
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ''; });
      return obj;
    });

    const phoneMap = new Map();
    for (const msg of data) {
      const phone = msg.phone;
      if (!phone) continue;
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, { phone, profileName: msg.profileName || '', messages: [] });
      }
      phoneMap.get(phone).messages.push(msg);
    }

    const all = [];
    for (const [phone, entry] of phoneMap) {
      entry.messages.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
      const lastMsg = entry.messages[entry.messages.length - 1];
      all.push({
        phone,
        profileName: entry.profileName,
        lastMessage: lastMsg.message || '',
        lastTimestamp: lastMsg.timestamp || '',
        messageCount: entry.messages.length,
      });
    }

    all.sort((a, b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));

    const total = all.length;
    const page = all.slice(offset, offset + limit);

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

    const rows = await getSheetData('Conversations', 'A:F');
    if (rows.length < 2) {
      return res.json({ messages: [], total: 0, hasMore: false });
    }

    const headers = rows[0];
    const data = rows.slice(1)
      .map((row) => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = row[i] || ''; });
        return obj;
      })
      .filter((msg) => msg.phone === phone);

    data.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

    const total = data.length;
    const messages = data.slice(-limit);
    const profileName = data.find(m => m.profileName)?.profileName || phone;

    res.json({ messages, total, hasMore: total > limit, profileName });
  } catch (err) {
    console.error('Error fetching conversation:', err.message);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

export default router;
