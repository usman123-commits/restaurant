import { Router } from 'express';
import { Handoff } from '../models.js';
import { HANDOFF_REASON_KEYS, OTHER_REASON, isKnownReason } from '../shared/handoffReasons.js';
import { clampLimit, parseCursor, fetchPage, timeRange, and } from '../lib/paging.js';

const router = Router();

const ALL = 'All';
const REASON_TABS = [ALL, ...HANDOFF_REASON_KEYS, OTHER_REASON.key];
const STATUSES = ['all', 'active', 'resolved'];
// The active queue is never hidden behind "Load more".
const ACTIVE_LIMIT = 500;

function reasonFilter(reason) {
  if (!reason || reason === ALL) return null;
  if (reason === OTHER_REASON.key) return { reason: { $nin: HANDOFF_REASON_KEYS } };
  return { reason };
}

function statusFilter(status) {
  if (status === 'active') return { status: { $ne: 'resolved' } };
  if (status === 'resolved') return { status: 'resolved' };
  return null;
}

function parseStatus(raw) {
  return STATUSES.includes(raw) ? raw : 'all';
}

// Per-reason counts for the given status + date, and per-status counts for the given reason + date.
async function counts(query) {
  const range = timeRange(query.from, query.to);
  const status = parseStatus(query.status);
  const [byReason, byStatus] = await Promise.all([
    Handoff.aggregate([
      { $match: and(range, statusFilter(status)) },
      { $group: { _id: { $cond: [{ $in: ['$reason', HANDOFF_REASON_KEYS] }, '$reason', OTHER_REASON.key] }, n: { $sum: 1 } } },
    ]),
    Handoff.aggregate([
      { $match: and(range, reasonFilter(query.reason)) },
      { $group: { _id: { $cond: [{ $eq: ['$status', 'resolved'] }, 'resolved', 'active'] }, n: { $sum: 1 } } },
    ]),
  ]);
  const reasonCounts = Object.fromEntries(REASON_TABS.map((k) => [k, 0]));
  for (const r of byReason) { reasonCounts[r._id] = r.n; reasonCounts[ALL] += r.n; }
  const statusCounts = { all: 0, active: 0, resolved: 0 };
  for (const r of byStatus) { statusCounts[r._id] = r.n; statusCounts.all += r.n; }
  return { reasonCounts, statusCounts };
}

async function reasonPage(reason, query, cursor) {
  const status = parseStatus(query.status);
  const limit = status === 'active' ? ACTIVE_LIMIT : clampLimit(query.limit, 20, 100);
  const filter = and(timeRange(query.from, query.to), statusFilter(status), reasonFilter(reason));
  const page = await fetchPage(Handoff, filter, { limit, cursor });
  return { handoffs: page.items, hasMore: page.hasMore, nextCursor: page.nextCursor };
}

// GET /api/handoffs?reason=All&status=all&from=<ISO>&to=<ISO>&limit=20&before=<cursor>
//   -> { handoffs, hasMore, nextCursor, reasonCounts?, statusCounts? }  (counts on the first page)
// Without `limit` it returns the legacy plain array of every handoff.
router.get('/', async (req, res) => {
  try {
    if (req.query.limit === undefined) {
      const handoffs = await Handoff.find().sort({ timestamp: -1 }).lean();
      return res.json(handoffs);
    }
    const cursor = parseCursor(req.query.before);
    const [page, c] = await Promise.all([
      reasonPage(req.query.reason, req.query, cursor),
      cursor ? null : counts(req.query),
    ]);
    res.json({ ...page, ...(c || {}) });
  } catch (err) {
    console.error('Error fetching handoffs:', err.message);
    res.status(500).json({ error: 'Failed to fetch handoffs' });
  }
});

// GET /api/handoffs/tabs?status=all&from=<ISO>&to=<ISO>&limit=20
//   -> { [reason]: <same payload as GET /api/handoffs?reason=<reason>> }
// First page of every reason tab in one request, so the dashboard can pre-fill its cache.
router.get('/tabs', async (req, res) => {
  try {
    const pages = await Promise.all(REASON_TABS.map((r) => reasonPage(r, req.query, null)));
    // Per-status counts depend on the reason, so compute them per tab.
    const perTab = await Promise.all(REASON_TABS.map((r) => counts({ ...req.query, reason: r })));
    res.json(Object.fromEntries(REASON_TABS.map((r, i) => [r, { ...pages[i], ...perTab[i] }])));
  } catch (err) {
    console.error('Error fetching handoff tabs:', err.message);
    res.status(500).json({ error: 'Failed to fetch handoff tabs' });
  }
});

// GET /api/handoffs/active-phones -> { phones: [...] }
// Small lookup for the Conversations pages ("is this customer handed off?"),
// so they don't download the whole handoff history.
router.get('/active-phones', async (req, res) => {
  try {
    const phones = await Handoff.distinct('phone', { status: { $ne: 'resolved' } });
    res.json({ phones: phones.map(String) });
  } catch (err) {
    console.error('Error fetching active handoff phones:', err.message);
    res.status(500).json({ error: 'Failed to fetch active handoffs' });
  }
});

// POST /api/handoffs - manually handoff a conversation from the dashboard
router.post('/', async (req, res) => {
  try {
    const {
      phone,
      profileName = '',
      reason = 'dashboard',
      description = 'Handed off manually from the dashboard',
      lastMessage = 'none',
    } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!isKnownReason(reason)) {
      return res.status(400).json({ error: `reason must be one of: ${HANDOFF_REASON_KEYS.join(', ')}` });
    }

    const handoff = await Handoff.create({
      phone,
      profileName,
      reason,
      description: description || '',
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
