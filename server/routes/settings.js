import { Router } from 'express';
import { BotConfig } from '../models.js';

const router = Router();

async function getConfigMap() {
  const docs = await BotConfig.find().lean();
  const map = {};
  for (const doc of docs) {
    map[doc.key] = doc.value;
  }
  return map;
}

async function setConfigValue(key, value) {
  await BotConfig.findOneAndUpdate(
    { key },
    { value: String(value) },
    { upsert: true, new: true }
  );
}

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const map = await getConfigMap();

    res.json({
      systemPrompt:       map.SYSTEM_PROMPT          || '',
      maxContextMessages: parseInt(map.MAX_CONTEXT_MESSAGES || '50', 10),
      claudeBudget:       parseFloat(map.CLAUDE_BUDGET  || '0'),
      claudeSpent:        parseFloat(map.CLAUDE_SPENT   || '0'),
      whisperBudget:      parseFloat(map.WHISPER_BUDGET || '0'),
      whisperSpent:       parseFloat(map.WHISPER_SPENT  || '0'),
    });
  } catch (err) {
    console.error('Error fetching settings:', err.message);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PATCH /api/settings
router.patch('/', async (req, res) => {
  try {
    const { systemPrompt, maxContextMessages, claudeBudget, claudeSpent, whisperBudget, whisperSpent } = req.body;

    const updates = [];
    if (systemPrompt        !== undefined) updates.push(['SYSTEM_PROMPT',         systemPrompt]);
    if (maxContextMessages  !== undefined) updates.push(['MAX_CONTEXT_MESSAGES',  String(maxContextMessages)]);
    if (claudeBudget        !== undefined) updates.push(['CLAUDE_BUDGET',          String(claudeBudget)]);
    if (claudeSpent         !== undefined) updates.push(['CLAUDE_SPENT',           String(claudeSpent)]);
    if (whisperBudget       !== undefined) updates.push(['WHISPER_BUDGET',         String(whisperBudget)]);
    if (whisperSpent        !== undefined) updates.push(['WHISPER_SPENT',          String(whisperSpent)]);

    await Promise.all(updates.map(([key, value]) => setConfigValue(key, value)));

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating settings:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
