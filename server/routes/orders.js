import { Router } from 'express';
import { Order } from '../models.js';

const router = Router();

// GET /api/orders - all orders, newest first
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ timestamp: -1 }).lean();
    res.json(orders);
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
