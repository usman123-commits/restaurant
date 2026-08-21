import { Router } from 'express';
import { getSheetData, updateCell } from '../sheets.js';

const router = Router();

// GET /api/handoffs - all handoffs
router.get('/', async (req, res) => {
  try {
    const rows = await getSheetData('Handoffs', 'A:F');
    if (rows.length < 2) {
      return res.json([]);
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      obj._rowIndex = index; // 0-based data row index (excluding header)
      return obj;
    });

    // Sort newest first
    data.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    res.json(data);
  } catch (err) {
    console.error('Error fetching handoffs:', err.message);
    res.status(500).json({ error: 'Failed to fetch handoffs' });
  }
});

// PATCH /api/handoffs/:rowIndex/resolve - mark specific handoff as resolved
router.patch('/:rowIndex/resolve', async (req, res) => {
  try {
    const { rowIndex } = req.params;
    const idx = parseInt(rowIndex, 10);

    const rows = await getSheetData('Handoffs', 'A:F');
    if (rows.length < 2 || isNaN(idx) || idx < 0 || idx >= rows.length - 1) {
      return res.status(404).json({ error: 'Handoff not found' });
    }

    const headers = rows[0];
    const statusCol = headers.indexOf('status');

    if (statusCol === -1) {
      return res.status(500).json({ error: 'Column not found in sheet' });
    }

    // Update status in sheet. Sheet row is idx + 2 (1-based, +1 for headers)
    const colLetter = String.fromCharCode(65 + statusCol);
    const cellRange = `${colLetter}${idx + 2}`;
    await updateCell('Handoffs', cellRange, 'resolved');

    res.json({ success: true, rowIndex: idx });
  } catch (err) {
    console.error('Error resolving handoff:', err.message);
    res.status(500).json({ error: 'Failed to resolve handoff' });
  }
});

export default router;
