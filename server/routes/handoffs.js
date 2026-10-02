import { Router } from 'express';
import { Handoff } from '../models.js';

const router = Router();

// GET /api/handoffs - all handoffs, newest first
router.get('/', async (req, res) => {
  try {
    const handoffs = await Handoff.find().sort({ timestamp: -1 }).lean();
    res.json(handoffs);
  } catch (err) {
    console.error('Error fetching handoffs:', err.message);
    res.status(500).json({ error: 'Failed to fetch handoffs' });
  }
});

// POST /api/handoffs - manually handoff a conversation
router.post('/', async (req, res) => {
  try {
    const {
      phone,
      profileName = '',
      reason = 'Handed off manually by dashboard',
      lastMessage = 'none',
    } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const handoff = await Handoff.create({
      phone,
      profileName,
      reason: reason || 'Handed off manually by dashboard',
      lastMessage: lastMessage || 'none',
      status: 'active',
    });

    res.json({ success: true, message: 'Handoff created successfully', handoff });
  } catch (err) {
    console.error('Error creating manual handoff:', err.message);
    res.status(500).json({ error: 'Failed to create handoff' });
  }
});

// PATCH /api/handoffs/:id/resolve - mark a handoff as resolved by MongoDB _id
router.patch('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;

    const handoff = await Handoff.findByIdAndUpdate(
      id,
      { status: 'resolved', resolvedAt: new Date() },
      { new: true }
    );

    if (!handoff) {
      return res.status(404).json({ error: 'Handoff not found' });
    }

    res.json({ success: true, handoff });
  } catch (err) {
    console.error('Error resolving handoff:', err.message);
    res.status(500).json({ error: 'Failed to resolve handoff' });
  }
});

export default router;
