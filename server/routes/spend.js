import { Router } from 'express';
import { getSheetData, appendRow, deleteRow } from '../sheets.js';

const router = Router();

// GET /api/spend - get all spend records & summary statistics
router.get('/', async (req, res) => {
  try {
    const rows = await getSheetData('Spend', 'A:E');
    if (rows.length < 2) {
      return res.json({
        totalSpend: 0,
        todaySpend: 0,
        monthSpend: 0,
        byCategory: {},
        spends: [],
      });
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      obj._rowIndex = index; // 0-based data row index
      obj.amount = parseFloat(obj.amount) || 0;
      return obj;
    });

    // Summary calculations
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let totalSpend = 0;
    let todaySpend = 0;
    let monthSpend = 0;
    const byCategory = {};

    data.forEach((item) => {
      const amt = item.amount || 0;
      const t = new Date(item.timestamp).getTime();

      totalSpend += amt;

      if (!isNaN(t) && t >= startOfToday) {
        todaySpend += amt;
      }
      if (!isNaN(t) && t >= startOfMonth) {
        monthSpend += amt;
      }

      const cat = item.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    });

    // Sort newest first
    data.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    res.json({
      totalSpend,
      todaySpend,
      monthSpend,
      byCategory,
      spends: data,
    });
  } catch (err) {
    console.error('Error fetching spend data:', err.message);
    res.status(500).json({ error: 'Failed to fetch spend data' });
  }
});

// POST /api/spend - add a new spend record
router.post('/', async (req, res) => {
  try {
    const {
      description,
      amount,
      category = 'Other',
      paymentMethod = 'Cash',
    } = req.body;

    if (!description || description.trim() === '') {
      return res.status(400).json({ error: 'Description is required' });
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount greater than 0 is required' });
    }

    const timestamp = new Date().toISOString();
    const rowValues = [
      timestamp,
      description.trim(),
      category.trim() || 'Other',
      numAmount.toString(),
      paymentMethod.trim() || 'Cash',
    ];

    await appendRow('Spend', rowValues);

    res.json({
      success: true,
      message: 'Expense added successfully',
      spend: {
        timestamp,
        description: description.trim(),
        category: category.trim() || 'Other',
        amount: numAmount,
        paymentMethod: paymentMethod.trim() || 'Cash',
      },
    });
  } catch (err) {
    console.error('Error creating spend record:', err.message);
    res.status(500).json({ error: 'Failed to record spend' });
  }
});

// DELETE /api/spend/:rowIndex - delete a spend record
router.delete('/:rowIndex', async (req, res) => {
  try {
    const { rowIndex } = req.params;
    const idx = parseInt(rowIndex, 10);

    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Invalid row index' });
    }

    await deleteRow('Spend', idx);

    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Error deleting spend record:', err.message);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
