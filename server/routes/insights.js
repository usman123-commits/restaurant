import { Router } from 'express';
import { Order, Spend } from '../models.js';
import { moneySeries, spendsByCategory, areaStats, customerStats, liveBoard } from '../shared/insights.js';

// Insights page (money: revenue by order type vs spends, delivery areas, customers) and the live
// board on the Dashboard. Demo records (demo: true, from server/scripts/demoData.js) are included
// and counted, so the charts can be seen before real data exists; remove them with
// `npm run demo:remove`.
const router = Router();
const DAY = 24 * 60 * 60 * 1000;

// ?from&to (ISO), default the last 30 days, at most 400 days
function rangeOf(q) {
  const to = q.to ? new Date(q.to) : new Date();
  let from = q.from ? new Date(q.from) : new Date(+to - 30 * DAY);
  if (Number.isNaN(+from) || Number.isNaN(+to) || from >= to) throw Object.assign(new Error('bad date range'), { status: 400 });
  if (+to - +from > 400 * DAY) from = new Date(+to - 400 * DAY);
  return { from, to };
}

// GET /api/insights?from=ISO&to=ISO (default: last 30 days)
router.get('/', async (req, res) => {
  try {
    const { from, to } = rangeOf(req.query);
    const projection = { timestamp: 1, totalAmount: 1, status: 1, orderType: 1, phone: 1, profileName: 1, deliveryAddress: 1, deliveryArea: 1, deliveryCharge: 1, demo: 1 };
    const [orders, allOrders, spends] = await Promise.all([
      Order.find({ timestamp: { $gte: from, $lt: to } }, projection).lean(),
      // every order: first / last order of each customer (new vs returning, lapsed)
      Order.find({}, { phone: 1, profileName: 1, timestamp: 1, totalAmount: 1, status: 1, orderType: 1, deliveryAddress: 1, demo: 1 }).lean(),
      Spend.find({ timestamp: { $gte: from, $lt: to } }).lean(),
    ]);
    res.json({
      range: { from, to },
      money: moneySeries(orders, spends, { from, to }),
      spendCategories: spendsByCategory(spends),
      areas: areaStats(orders),
      customers: customerStats(allOrders, { from, to }),
      demo: { orders: orders.filter((o) => o.demo).length, spends: spends.filter((s) => s.demo).length },
    });
  } catch (err) {
    console.error('Error building insights:', err.message);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Failed to build insights' });
  }
});

// GET /api/insights/live -> orders being prepared or on the way, with waiting times
router.get('/live', async (req, res) => {
  try {
    const orders = await Order.find({ status: { $in: ['preparing', 'on_the_way'] }, timestamp: { $gte: new Date(Date.now() - 2 * DAY) } }).lean();
    res.json({ now: new Date(), orders: liveBoard(orders) });
  } catch (err) {
    console.error('Error building live board:', err.message);
    res.status(500).json({ error: 'Failed to load live orders' });
  }
});

export default router;
