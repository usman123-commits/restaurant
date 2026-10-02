import { Router } from 'express';
import { Spend } from '../models.js';

const router = Router();

// GET /api/spend - get all spend records & summary statistics
router.get('/', async (req, res) => {
  try {
    const spends = await Spend.find().sort({ timestamp: -1 }).lean();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let totalSpend = 0;
    let todaySpend = 0;
    let monthSpend = 0;
    const byCategory = {};

    for (const item of spends) {
      const amt = item.amount || 0;
      const t   = new Date(item.timestamp).getTime();

      totalSpend += amt;
      if (!isNaN(t) && t >= startOfToday) todaySpend += amt;
      if (!isNaN(t) && t >= startOfMonth) monthSpend += amt;

      const cat = item.category || 'Other';
      byCategory[cat] = (byCategory[cat] || 0) + amt;
    }

    res.json({ totalSpend, todaySpend, monthSpend, byCategory, spends });
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

    const spend = await Spend.create({
      description:   description.trim(),
      category:      category.trim() || 'Other',
      amount:        numAmount,
      paymentMethod: paymentMethod.trim() || 'Cash',
    });

    res.json({ success: true, message: 'Expense added successfully', spend });
  } catch (err) {
    console.error('Error creating spend record:', err.message);
    res.status(500).json({ error: 'Failed to record spend' });
  }
});

// DELETE /api/spend/:id - delete a spend record by MongoDB _id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Spend.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: 'Spend record not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Error deleting spend record:', err.message);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
