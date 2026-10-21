import { Router } from 'express';
import { Order, Spend } from '../models.js';
import { moneySeries, spendSeries, spendsByCategory, areaStats, customerStats, liveBoard } from '../shared/insights.js';

// Dashboard sections (spends, delivery areas, customers) and the live board. Demo records
// (demo: true, from server/scripts/demoData.js) are included and counted, so the charts can be
// seen before real data exists; remove them with `npm run demo:remove`.
const router = Router();
const DAY = 24 * 60 * 60 * 1000;

// ?days=N (the last N days up to now) or ?from&to (ISO); default the last 30 days, at most 400
function rangeOf(q) {
  const to = q.to ? new Date(q.to) : new Date();
  const days = Number(q.days);
  let from = q.from ? new Date(q.from) : new Date(+to - (days > 0 ? days : 30) * DAY);
  if (Number.isNaN(+from) || Number.isNaN(+to) || from >= to) throw Object.assign(new Error('bad date range'), { status: 400 });
  if (+to - +from > 400 * DAY) from = new Date(+to - 400 * DAY);
  return { from, to };
}

const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// GET /api/insights?from=ISO&to=ISO (default: last 30 days)
router.get('/', async (req, res) => {
  try {
    const { from, to } = rangeOf(req.query);
    // the period just before, as long as this one (for the "vs previous period" chips)
    const prevFrom = new Date(+from - (+to - +from));
    const projection = { timestamp: 1, totalAmount: 1, status: 1, orderType: 1, phone: 1, profileName: 1, deliveryAddress: 1, deliveryArea: 1, deliveryCharge: 1, demo: 1 };
    const [orders, allOrders, spends, prevOrders, prevSpends] = await Promise.all([
      Order.find({ timestamp: { $gte: from, $lt: to } }, projection).lean(),
      // every order: first / last order of each customer (new vs returning, lapsed)
      Order.find({}, { phone: 1, profileName: 1, timestamp: 1, totalAmount: 1, status: 1, orderType: 1, deliveryAddress: 1, demo: 1 }).lean(),
      Spend.find({ timestamp: { $gte: from, $lt: to } }).lean(),
      Order.find({ timestamp: { $gte: prevFrom, $lt: from }, status: { $ne: 'cancelled' } }, { totalAmount: 1 }).lean(),
      Spend.find({ timestamp: { $gte: prevFrom, $lt: from } }, { amount: 1 }).lean(),
    ]);
    const prevRevenue = sum(prevOrders, (o) => o.totalAmount);
    const prevSpent = sum(prevSpends, (s) => s.amount);
    res.json({
      range: { from, to },
      money: moneySeries(orders, spends, { from, to }),
      previous: { revenue: prevRevenue, spends: prevSpent, net: prevRevenue - prevSpent },
      spendSeries: spendSeries(spends, { from, to }),
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
