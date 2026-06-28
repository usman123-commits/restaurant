import { Router } from 'express';
import { getSheetData } from '../sheets.js';

const router = Router();

// GET /api/analytics
router.get('/', async (req, res) => {
  try {
    const [orderRows, convRows] = await Promise.all([
      getSheetData('Orders', 'A:I'),
      getSheetData('Conversations', 'A:F'),
    ]);

    // Parse orders
    const orderHeaders = orderRows[0] || [];
    const orders = orderRows.slice(1).map((row) => {
      const obj = {};
      orderHeaders.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });

    // Parse conversations
    const convHeaders = convRows[0] || [];
    const conversations = convRows.slice(1).map((row) => {
      const obj = {};
      convHeaders.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      return obj;
    });

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Basic stats
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Today's stats
    const todayOrders = orders.filter((o) => {
      const d = new Date(o.timestamp);
      return !isNaN(d) && d.toISOString().split('T')[0] === todayStr;
    });
    const todayOrderCount = todayOrders.length;
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0);

    // Orders by day (last 30 days)
    const ordersByDay = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOrders = orders.filter((o) => {
        const od = new Date(o.timestamp);
        return !isNaN(od) && od.toISOString().split('T')[0] === dateStr;
      });
      ordersByDay.push({
        date: dateStr,
        count: dayOrders.length,
        revenue: dayOrders.reduce((sum, o) => sum + (parseFloat(o.totalAmount) || 0), 0),
      });
    }

    // Top items - parse the items column (JSON array or comma-separated)
    const itemCounts = {};
    for (const order of orders) {
      const itemsStr = order.items || '';
      let itemList = [];
      try {
        // Try parsing as JSON first
        const parsed = JSON.parse(itemsStr);
        if (Array.isArray(parsed)) {
          itemList = parsed.map((it) => (typeof it === 'object' ? it.name || it.item || '' : String(it)));
        }
      } catch {
        // Fallback: treat as comma-separated
        itemList = itemsStr.split(',').map((s) => s.trim()).filter(Boolean);
      }

      for (const name of itemList) {
        if (name) {
          itemCounts[name] = (itemCounts[name] || 0) + 1;
        }
      }
    }

    const topItems = Object.entries(itemCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Orders by hour
    const hourCounts = Array(24).fill(0);
    for (const order of orders) {
      const d = new Date(order.timestamp);
      if (!isNaN(d)) {
        hourCounts[d.getHours()]++;
      }
    }
    const ordersByHour = hourCounts.map((count, hour) => ({ hour, count }));

    // Conversion rate
    const uniqueConvPhones = new Set(conversations.map((c) => c.phone).filter(Boolean)).size;
    const uniqueOrderPhones = new Set(orders.map((o) => o.phone).filter(Boolean)).size;
    const conversionRate = uniqueConvPhones > 0 ? uniqueOrderPhones / uniqueConvPhones : 0;

    res.json({
      todayOrders: todayOrderCount,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      totalOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
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
