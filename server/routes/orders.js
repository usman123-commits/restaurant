import { Router } from 'express';
import { getSheetData, updateCell, appendRow } from '../sheets.js';

const router = Router();

// GET /api/orders - all orders, newest first
router.get('/', async (req, res) => {
  try {
    const rows = await getSheetData('Orders', 'A:I');
    if (rows.length < 2) {
      return res.json([]);
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      obj._rowIndex = index; // 0-based data row index (excluding header)
      return obj;
    });

    // Sort newest first by timestamp
    data.sort((a, b) => {
      const da = new Date(a.timestamp || 0);
      const db = new Date(b.timestamp || 0);
      return db - da;
    });

    res.json(data);
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

    // Generate unique order ID like OTTO-1785414632827
    const orderId = `OTTO-${Date.now()}`;
    const timestamp = new Date().toISOString();

    // Calculate total amount if not provided
    const computedTotal = totalAmount != null && !isNaN(Number(totalAmount))
      ? Number(totalAmount)
      : items.reduce((sum, item) => sum + (Number(item.price || 0) * (Number(item.qty) || 1)), 0);

    // Format items as JSON string (matching other orders in sheet)
    const itemsJson = JSON.stringify(
      items.map((it) => ({
        name: it.name || it.item || '',
        qty: Number(it.qty) || 1,
        price: Number(it.price) || 0,
      }))
    );

    // Phone: if provided use it, otherwise 'not_provided'
    const finalPhone = phone && phone.trim() ? phone.trim() : 'not_provided';

    // Headers: orderId, timestamp, phone, profileName, items, totalAmount, deliveryAddress, status, notes
    const rowValues = [
      orderId,
      timestamp,
      finalPhone,
      profileName.trim() || 'Dine-In Customer',
      itemsJson,
      computedTotal.toString(),
      deliveryAddress.trim() || 'Dine In',
      status.toLowerCase() || 'preparing',
      notes.trim() || '',
    ];

    await appendRow('Orders', rowValues);

    res.json({
      success: true,
      message: 'Order created successfully',
      order: {
        orderId,
        timestamp,
        phone: finalPhone,
        profileName: profileName.trim() || 'Dine-In Customer',
        items: itemsJson,
        totalAmount: computedTotal.toString(),
        deliveryAddress: deliveryAddress.trim() || 'Dine In',
        status: status.toLowerCase() || 'preparing',
        notes: notes.trim() || '',
      },
    });
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

    const rows = await getSheetData('Orders', 'A:I');
    if (rows.length < 2) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const headers = rows[0];
    const orderIdCol = headers.indexOf('orderId');
    const statusCol = headers.indexOf('status');

    if (orderIdCol === -1 || statusCol === -1) {
      return res.status(500).json({ error: 'Column not found in sheet' });
    }

    // Find the row with matching orderId
    let targetRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][orderIdCol] === orderId) {
        targetRowIndex = i;
        break;
      }
    }

    // Validate status transition rule:
    // preparing -> on_the_way -> delivered (forward only, no rollback)
    // preparing -> delivered (direct for dine-in / direct pickup)
    // cancelled allowed only when currently preparing
    const currentStatus = (rows[targetRowIndex][statusCol] || 'preparing').toLowerCase();
    const targetStatus = status.toLowerCase();

    const allowedTransitions = {
      preparing: ['preparing', 'on_the_way', 'delivered', 'cancelled'],
      on_the_way: ['on_the_way', 'delivered'],
      delivered: ['delivered'],
      cancelled: ['cancelled'],
    };

    const allowed = allowedTransitions[currentStatus] || ['preparing', 'on_the_way', 'delivered', 'cancelled'];
    if (!allowed.includes(targetStatus)) {
      return res.status(400).json({
        error: `Invalid status transition from "${currentStatus}" to "${targetStatus}".`,
      });
    }

    // Update the status cell. Sheet row is targetRowIndex + 1 (1-based)
    const colLetter = String.fromCharCode(65 + statusCol); // A=0, B=1, ...
    const cellRange = `${colLetter}${targetRowIndex + 1}`;
    await updateCell('Orders', cellRange, status);

    res.json({ success: true, orderId, status });
  } catch (err) {
    console.error('Error updating order status:', err.message);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

export default router;
