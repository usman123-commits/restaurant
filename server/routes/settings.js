import { Router } from 'express';
import { BotConfig, MenuItem } from '../models.js';
import { DEFAULT_AREAS, DEFAULT_PAYMENT, validateAreas } from '../shared/deliveryAreas.js';

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

// ---- WhatsApp bot (otto-agent reads these botconfigs; changes apply within 5 minutes) ----

// GET /api/settings/bot -> payment message and delivery areas, plus the delivery charges that
// were entered as menu items before (category "Delivery charges"; the bot never read those)
router.get('/bot', async (req, res) => {
  try {
    const [payment, areasDoc, menuRows] = await Promise.all([
      BotConfig.findOne({ key: 'PAYMENT_INFO' }).lean(),
      BotConfig.findOne({ key: 'DELIVERY_AREAS' }).lean(),
      MenuItem.find({ category: /^\s*delivery\s*(charges?|fee|fees)?\s*$/i }).lean(),
    ]);
    let savedAreas = null;
    try {
      savedAreas = areasDoc?.value ? JSON.parse(areasDoc.value) : null;
    } catch { /* bad JSON: show the built-in list */ }
    res.json({
      paymentInfo: payment?.value?.trim() || DEFAULT_PAYMENT,
      paymentDefault: DEFAULT_PAYMENT,
      paymentSaved: Boolean(payment?.value?.trim()),
      deliveryAreas: Array.isArray(savedAreas) && savedAreas.length ? savedAreas : DEFAULT_AREAS,
      deliverySaved: Array.isArray(savedAreas) && savedAreas.length > 0,
      menuDeliveryItems: menuRows.map((r) => ({ name: String(r.item || '').trim(), charge: Number(r.price) || 0 })).filter((r) => r.name),
    });
  } catch (err) {
    console.error('Error fetching bot settings:', err.message);
    res.status(500).json({ error: 'Failed to fetch bot settings' });
  }
});

// PUT /api/settings/payment { text } -- what the bot says when asked about payment.
// Empty text -> back to the default (cash on delivery).
router.put('/payment', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').trim();
    if (text.length > 500) return res.status(400).json({ error: 'Keep it under 500 characters' });
    if (!text) await BotConfig.deleteOne({ key: 'PAYMENT_INFO' });
    else await setConfigValue('PAYMENT_INFO', text);
    res.json({ success: true, paymentInfo: text || DEFAULT_PAYMENT, paymentSaved: Boolean(text) });
  } catch (err) {
    console.error('Error saving payment message:', err.message);
    res.status(500).json({ error: 'Failed to save the payment message' });
  }
});

// PUT /api/settings/delivery-areas { areas: [{ name, charge, minutes, aliases }] }
router.put('/delivery-areas', async (req, res) => {
  try {
    const { areas, errors } = validateAreas(req.body?.areas);
    if (errors.length) return res.status(400).json({ error: errors.join('. '), errors });
    await setConfigValue('DELIVERY_AREAS', JSON.stringify(areas));
    res.json({ success: true, deliveryAreas: areas, deliverySaved: true });
  } catch (err) {
    console.error('Error saving delivery areas:', err.message);
    res.status(500).json({ error: 'Failed to save delivery areas' });
  }
});

export default router;
