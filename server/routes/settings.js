import { Router } from 'express';
import { getSheetData, updateCell, appendRow, ensureTab } from '../sheets.js';

const router = Router();

const CONFIG_TAB = 'BotConfig';

async function ensureConfigTab() {
  try {
    await ensureTab(CONFIG_TAB);
    const rows = await getSheetData(CONFIG_TAB, 'A:B');
    return rows;
  } catch {
    return null;
  }
}

async function getConfigMap() {
  const rows = await ensureConfigTab();
  if (!rows || rows.length < 1) return {};

  const map = {};
  for (let i = 0; i < rows.length; i++) {
    const key = rows[i][0];
    const value = rows[i][1] || '';
    if (key) map[key] = { value, rowIndex: i };
  }
  return map;
}

async function setConfigValue(key, value) {
  const map = await getConfigMap();
  if (map[key]) {
    const sheetRow = map[key].rowIndex + 1;
    await updateCell(CONFIG_TAB, `B${sheetRow}`, value);
  } else {
    await appendRow(CONFIG_TAB, [key, value]);
  }
}

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const map = await getConfigMap();

    res.json({
      systemPrompt: map.SYSTEM_PROMPT?.value || '',
      maxContextMessages: parseInt(map.MAX_CONTEXT_MESSAGES?.value || '50', 10),
      claudeBudget: parseFloat(map.CLAUDE_BUDGET?.value || '0'),
      claudeSpent: parseFloat(map.CLAUDE_SPENT?.value || '0'),
      whisperBudget: parseFloat(map.WHISPER_BUDGET?.value || '0'),
      whisperSpent: parseFloat(map.WHISPER_SPENT?.value || '0'),
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
    if (systemPrompt !== undefined) updates.push(['SYSTEM_PROMPT', systemPrompt]);
    if (maxContextMessages !== undefined) updates.push(['MAX_CONTEXT_MESSAGES', String(maxContextMessages)]);
    if (claudeBudget !== undefined) updates.push(['CLAUDE_BUDGET', String(claudeBudget)]);
    if (claudeSpent !== undefined) updates.push(['CLAUDE_SPENT', String(claudeSpent)]);
    if (whisperBudget !== undefined) updates.push(['WHISPER_BUDGET', String(whisperBudget)]);
    if (whisperSpent !== undefined) updates.push(['WHISPER_SPENT', String(whisperSpent)]);

    for (const [key, value] of updates) {
      await setConfigValue(key, value);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating settings:', err.message);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
