import { Router } from 'express';
import { Spend } from '../models.js';
import { clampLimit, parseCursor, fetchPage, timeRange, searchFilter, escapeRegex, and } from '../lib/paging.js';

const router = Router();

const SEARCH_FIELDS = ['description', 'category', 'paymentMethod'];

// Start of the user's local day/month as UTC instants. `tz` is the browser's
// getTimezoneOffset() in minutes (PKT = -300). The server runs in UTC, so without
// this "today" would start at 5am Pakistan time.
function localBoundaries(tzRaw) {
  const tz = Number.isFinite(Number(tzRaw)) ? Number(tzRaw) : 0;
  const shift = tz * 60000;
  const local = new Date(Date.now() - shift);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  return {
    startOfToday: new Date(Date.UTC(y, m, d) + shift),
    startOfMonth: new Date(Date.UTC(y, m, 1) + shift),
  };
}

// Matches the old JS fallback `item.category || 'Other'` (covers missing and '').
const CATEGORY_OR_OTHER = { $cond: [{ $in: [{ $ifNull: ['$category', ''] }, ['']] }, 'Other', '$category'] };

function categoryFilter(category) {
  if (!category || category === 'All') return null;
  const exact = { category: new RegExp(`^${escapeRegex(category)}$`, 'i') };
  if (category.toLowerCase() !== 'other') return exact;
  return { $or: [exact, { category: { $in: [null, ''] } }] };
}

// Sums computed in MongoDB instead of loading every record into Node.
async function summary(tz) {
  const { startOfToday, startOfMonth } = localBoundaries(tz);
  const [row] = await Spend.aggregate([
    {
      $facet: {
        totals: [{
          $group: {
            _id: null,
            totalSpend: { $sum: '$amount' },
            totalCount: { $sum: 1 },
            todaySpend: { $sum: { $cond: [{ $gte: ['$timestamp', startOfToday] }, '$amount', 0] } },
            monthSpend: { $sum: { $cond: [{ $gte: ['$timestamp', startOfMonth] }, '$amount', 0] } },
          },
        }],
        byCategory: [{ $group: { _id: CATEGORY_OR_OTHER, amount: { $sum: '$amount' } } }],
      },
    },
  ]);
  const t = row?.totals?.[0] || {};
  return {
    totalSpend: t.totalSpend || 0,
    totalCount: t.totalCount || 0,
    todaySpend: t.todaySpend || 0,
    monthSpend: t.monthSpend || 0,
    byCategory: Object.fromEntries((row?.byCategory || []).map((c) => [c._id || 'Other', c.amount])),
  };
}

// Per-category counts for the current date + search filter
// (category excluded, so every category button shows its own count).
async function filteredStats(base) {
  const rows = await Spend.aggregate([
    { $match: base },
    { $group: { _id: { $toLower: CATEGORY_OR_OTHER }, count: { $sum: 1 } } },
  ]);
  const categoryCounts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const filteredCount = rows.reduce((n, r) => n + r.count, 0);
  return { categoryCounts, filteredCount };
}

// GET /api/spend?category=All&from=<ISO>&to=<ISO>&q=&tz=-300&limit=20&before=<cursor>
//   -> { spends, hasMore, nextCursor, totalSpend, todaySpend, monthSpend, totalCount,
//        byCategory, categoryCounts, filteredCount }   (stats only on the first page)
// Without `limit` it returns the legacy payload with every record.
router.get('/', async (req, res) => {
  try {
    if (req.query.limit === undefined) {
      const [spends, stats] = await Promise.all([
        Spend.find().sort({ timestamp: -1 }).lean(),
        summary(req.query.tz),
      ]);
      return res.json({ ...stats, spends });
    }

    const limit = clampLimit(req.query.limit, 20, 100);
    const cursor = parseCursor(req.query.before);
    const base = and(timeRange(req.query.from, req.query.to), searchFilter(req.query.q, SEARCH_FIELDS));

    const [page, stats, filtered] = await Promise.all([
      fetchPage(Spend, and(base, categoryFilter(req.query.category)), { limit, cursor }),
      cursor ? null : summary(req.query.tz),
      cursor ? null : filteredStats(base),
    ]);

    res.json({
      spends: page.items,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      ...(stats || {}),
      ...(filtered || {}),
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
