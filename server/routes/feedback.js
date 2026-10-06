import { Router } from 'express';
import mongoose from 'mongoose';
import { Conversation, Feedback } from '../models.js';

// "Report wrong reply" on a bot message (Conversations page). The report keeps the customer's
// message, the bot's reply, what the staff says was wrong, and the bot's turn id (its full trace:
// what the AI understood, the steps it ran, LangSmith run). Reports are reviewed in the Zelvop
// console and turned into fixes and tests for the bot.
const router = Router();

// the bot's turn for this reply: written on the message since 2026-10-06; for older messages
// the turn of the same phone that started just before the reply was logged
async function turnIdFor(msg) {
  if (msg.turnId) return msg.turnId;
  const at = new Date(msg.timestamp);
  const turn = await mongoose.connection.db
    .collection('turns')
    .find({ phone: msg.phone, at: { $lte: at, $gte: new Date(at.getTime() - 120000) } }, { projection: { _id: 1 } })
    .sort({ at: -1 })
    .limit(1)
    .next();
  return turn?._id || null;
}

// POST /api/feedback { conversationId, note } -> { success, report }
// Reporting the same message again updates the note.
router.post('/', async (req, res) => {
  try {
    const { conversationId, note = '' } = req.body || {};
    if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ error: 'Unknown message' });
    // raw document: turnId is written by the bot and may be missing from older messages
    const msg = await Conversation.collection.findOne({ _id: new mongoose.Types.ObjectId(conversationId) });
    if (!msg || !(msg.role === 'assistant' || msg.profileName === 'BOT')) {
      return res.status(400).json({ error: 'Only bot replies can be reported' });
    }
    const customer = await Conversation.collection
      .find({ phone: msg.phone, role: { $ne: 'assistant' }, profileName: { $ne: 'BOT' }, timestamp: { $lte: msg.timestamp } })
      .sort({ timestamp: -1 })
      .limit(1)
      .next();
    const report = await Feedback.findOneAndUpdate(
      { conversationId: String(msg._id) },
      {
        $set: { note: String(note).trim().slice(0, 1000) },
        $setOnInsert: {
          turnId: await turnIdFor(msg),
          phone: msg.phone,
          profileName: customer?.profileName || '',
          customerMessage: customer?.message || '',
          botReply: msg.message || '',
          repliedAt: msg.timestamp,
          source: 'dashboard',
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    res.json({ success: true, report });
  } catch (err) {
    console.error('Error saving report:', err.message);
    res.status(500).json({ error: 'Failed to save the report' });
  }
});

// DELETE /api/feedback/:conversationId -> undo a report
router.delete('/:conversationId', async (req, res) => {
  try {
    await Feedback.deleteOne({ conversationId: String(req.params.conversationId) });
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing report:', err.message);
    res.status(500).json({ error: 'Failed to remove the report' });
  }
});

export default router;
