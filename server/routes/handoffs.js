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
    const data = rows.slice(1).map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
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

// PATCH /api/handoffs/:phone/resolve - mark handoff as resolved
router.patch('/:phone/resolve', async (req, res) => {
  try {
    const { phone } = req.params;

    const rows = await getSheetData('Handoffs', 'A:F');
    if (rows.length < 2) {
      return res.status(404).json({ error: 'Handoff not found' });
    }

    const headers = rows[0];
    const phoneCol = headers.indexOf('phone');
    const statusCol = headers.indexOf('status');

    if (phoneCol === -1 || statusCol === -1) {
      return res.status(500).json({ error: 'Column not found in sheet' });
    }

    // Find all rows matching this phone and update status
    let updated = 0;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][phoneCol] === phone && rows[i][statusCol] !== 'resolved') {
        const colLetter = String.fromCharCode(65 + statusCol);
        const cellRange = `${colLetter}${i + 1}`;
        await updateCell('Handoffs', cellRange, 'resolved');
        updated++;
      }
    }

    if (updated === 0) {
      return res.status(404).json({ error: 'No unresolved handoffs found for this phone' });
    }

    res.json({ success: true, updated });
  } catch (err) {
    console.error('Error resolving handoff:', err.message);
    res.status(500).json({ error: 'Failed to resolve handoff' });
  }
});

export default router;
