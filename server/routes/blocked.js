import { Router } from 'express';
import { BlockedNumber } from '../models.js';
import { normalizeNumber, isValidNumber } from '../shared/phone.js';

// Numbers the WhatsApp bot ignores (no reply, no "typing...", not passed to the bot).
// The WhatsApp bridge re-reads this collection every minute.
// Typical use: the owner's number (it only messages to keep the 24 h alert window open), spam.
const router = Router();

// GET /api/blocked -> { numbers: [{ _id, phone, profileName, note, createdAt }] }
router.get('/', async (req, res) => {
  try {
    const numbers = await BlockedNumber.find().sort({ createdAt: -1 }).lean();
    res.json({ numbers });
  } catch (err) {
    console.error('Error fetching blocked numbers:', err.message);
    res.status(500).json({ error: 'Failed to fetch blocked numbers' });
  }
});

// POST /api/blocked { phone, profileName?, note? } -> { success, number }
// Blocking an already blocked number just updates its note.
router.post('/', async (req, res) => {
  try {
    const { phone, profileName = '', note = '' } = req.body || {};
    if (!isValidNumber(phone)) {
      return res.status(400).json({ error: 'Enter a valid phone number, e.g. 03001234567 or +92 300 1234567' });
    }
    const number = await BlockedNumber.findOneAndUpdate(
      { phone: normalizeNumber(phone) },
      { $set: { profileName: String(profileName || ''), note: String(note || '') } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, number });
  } catch (err) {
    console.error('Error blocking number:', err.message);
    res.status(500).json({ error: 'Failed to block number' });
  }
});

// DELETE /api/blocked/:phone -> { success }
router.delete('/:phone', async (req, res) => {
  try {
    const result = await BlockedNumber.deleteOne({ phone: normalizeNumber(req.params.phone) });
    if (!result.deletedCount) return res.status(404).json({ error: 'Number is not blocked' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error unblocking number:', err.message);
    res.status(500).json({ error: 'Failed to unblock number' });
  }
});

export default router;
