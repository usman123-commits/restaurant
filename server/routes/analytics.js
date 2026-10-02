import { Router } from 'express';
import { Order, Conversation, MenuItem } from '../models.js';

const router = Router();

// GET /api/analytics
router.get('/', async (req, res) => {
  try {
    const [orders, conversations, menuItems] = await Promise.all([
      Order.find().lean(),
      Conversation.find().lean(),
      MenuItem.find().lean(),
    ]);

    // Build menu lookup map
    const menuMap = {};
    for (const m of menuItems) {
      menuMap[m.item.toLowerCase().trim()] = m;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Basic stats
    const totalOrders  = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Today's stats
    const todayOrders  = orders.filter((o) => new Date(o.timestamp).toISOString().split('T')[0] === todayStr);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Revenue & count per date
    const dateRevenueMap = {};
    const dateCountMap   = {};
    for (const o of orders) {
      const d = new Date(o.timestamp);
      if (!isNaN(d)) {
        const dateStr = d.toISOString().split('T')[0];
        dateRevenueMap[dateStr] = (dateRevenueMap[dateStr] || 0) + (o.totalAmount || 0);
        dateCountMap[dateStr]   = (dateCountMap[dateStr]   || 0) + 1;
      }
    }

    // Continuous 30-day series ending today
    const ordersByDay = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      ordersByDay.push({
        date:      dateStr,
        day:       d.toLocaleDateString('en-US', { weekday: 'short' }),
        shortDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count:     dateCountMap[dateStr]   || 0,
        revenue:   Math.round((dateRevenueMap[dateStr] || 0) * 100) / 100,
      });
    }

    // Top items — items is a proper array in MongoDB
    const itemCounts = {};
    for (const order of orders) {
      const itemList = Array.isArray(order.items) ? order.items : [];
      for (const it of itemList) {
        const name = it.name || '';
        if (name) itemCounts[name] = (itemCounts[name] || 0) + (it.qty || 1);
      }
    }

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => {
        const meta = menuMap[name.toLowerCase().trim()] || {};
        return { name, count, price: meta.price || '', category: meta.category || '' };
      });

    // Orders by hour
    function formatHour(h) {
      if (h === 0)  return '12AM';
      if (h === 12) return '12PM';
      if (h > 12)   return `${h - 12}PM`;
      return `${h}AM`;
    }

    const hourCounts = Array(24).fill(0);
    for (const order of orders) {
      const d = new Date(order.timestamp);
      if (!isNaN(d)) hourCounts[d.getHours()]++;
    }
    const ordersByHour = hourCounts.map((count, hour) => ({ hour, label: formatHour(hour), count }));

    // Conversion rate
    const uniqueConvPhones  = new Set(conversations.map((c) => c.phone).filter(Boolean)).size;
    const uniqueOrderPhones = new Set(orders.map((o) => o.phone).filter(Boolean)).size;
    const conversionRate    = uniqueConvPhones > 0 ? uniqueOrderPhones / uniqueConvPhones : 0;

    res.json({
      todayOrders:    todayOrders.length,
      todayRevenue:   Math.round(todayRevenue * 100) / 100,
      totalOrders,
      totalRevenue:   Math.round(totalRevenue * 100) / 100,
      avgOrderValue:  Math.round(avgOrderValue * 100) / 100,
      ordersByDay,
      topItems,
      ordersByHour,
      conversionRate: Math.round(conversionRate * 10000) / 10000,
    });
  } catch (err) {
    console.error('Error computing analytics:', err.message);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

export default router;
