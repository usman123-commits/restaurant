import { Router } from 'express';
import { Order } from '../models.js';
import { ORDER_TABS, getTab, tabMongoFilter } from '../shared/orderTabs.js';
import { clampLimit, parseCursor, fetchPage, timeRange, searchFilter, and } from '../lib/paging.js';

const router = Router();

// Live kitchen queues (tabs marked `active`): never hide an order behind "Load more".
const ACTIVE_TAB_LIMIT = 500;

const SEARCH_FIELDS = ['orderId', 'profileName', 'phone', 'items.name', 'deliveryAddress', 'notes'];

// GET /api/orders?tab=All&from=<ISO>&to=<ISO>&q=&limit=20&before=<cursor>
//   -> { orders, hasMore, nextCursor, counts? }   (counts only on the first page)
// Without `limit` it returns the legacy plain array of every order.
router.get('/', async (req, res) => {
  try {
    if (req.query.limit === undefined) {
      const orders = await Order.find().sort({ timestamp: -1 }).lean();
      return res.json(orders);
    }

    const tab = getTab(req.query.tab);
    const limit = tab.active
      ? ACTIVE_TAB_LIMIT
      : clampLimit(req.query.limit, 20, 100);
    const cursor = parseCursor(req.query.before);

    // Date + search apply to both the list and the tab counts; the tab only to the list.
    const base = and(timeRange(req.query.from, req.query.to), searchFilter(req.query.q, SEARCH_FIELDS));

    const pagePromise = fetchPage(Order, and(base, tabMongoFilter(tab.name)), { limit, cursor });
    const countsPromise = cursor
      ? null
      : Promise.all(
          ORDER_TABS.map(async ({ name }) => [name, await Order.countDocuments(and(base, tabMongoFilter(name)))])
        ).then(Object.fromEntries);

    const [page, counts] = await Promise.all([pagePromise, countsPromise]);
    res.json({ orders: page.items, hasMore: page.hasMore, nextCursor: page.nextCursor, ...(counts && { counts }) });
  } catch (err) {
    console.error('Error fetching orders:', err.message);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// POST /api/orders - manually create a new order (Dine-In, etc.)
router.post('/', async (req, res) => {
  try {
    const {
      profileName = 'Dine-In Customer',
      phone = '',
      items = [],
      totalAmount,
      deliveryAddress = 'Dine In',
      notes = '',
      status = 'preparing',
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    const orderId = `OTTO-${Date.now()}`;
    const timestamp = new Date();

    const parsedItems = items.map((it) => ({
      name:  it.name || it.item || '',
      qty:   Number(it.qty) || 1,
      price: Number(it.price) || 0,
    }));

    const computedTotal =
      totalAmount != null && !isNaN(Number(totalAmount))
        ? Number(totalAmount)
        : parsedItems.reduce((sum, it) => sum + it.price * it.qty, 0);

    const finalPhone = phone && phone.trim() ? phone.trim() : 'not_provided';

    const order = await Order.create({
      orderId,
      timestamp,
      phone: finalPhone,
      profileName: profileName.trim() || 'Dine-In Customer',
      items: parsedItems,
      totalAmount: computedTotal,
      deliveryAddress: deliveryAddress.trim() || 'Dine In',
      status: status.toLowerCase() || 'preparing',
      notes: notes.trim() || '',
    });

    res.json({ success: true, message: 'Order created successfully', order });
  } catch (err) {
    console.error('Error creating order:', err.message);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PATCH /api/orders/:orderId/status - update status for an order
router.patch('/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Validate status transition
    const allowedTransitions = {
      preparing:  ['preparing', 'on_the_way', 'delivered', 'cancelled'],
      on_the_way: ['on_the_way', 'delivered'],
      delivered:  ['delivered'],
      cancelled:  ['cancelled'],
    };

    const currentStatus = order.status;
    const targetStatus = status.toLowerCase();
    const allowed = allowedTransitions[currentStatus] || ['preparing', 'on_the_way', 'delivered', 'cancelled'];

    if (!allowed.includes(targetStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from "${currentStatus}" to "${targetStatus}".`,
      });
    }

    order.status = targetStatus;
    await order.save();

    res.json({ success: true, orderId, status: targetStatus });
  } catch (err) {
    console.error('Error updating order status:', err.message);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
