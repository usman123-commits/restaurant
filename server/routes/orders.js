import { Router } from 'express';
import { getSheetData, updateCell } from '../sheets.js';

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

    if (targetRowIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
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
