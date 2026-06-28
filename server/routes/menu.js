import { Router } from 'express';
import { getSheetData, appendRow, updateRow, deleteRow } from '../sheets.js';

const router = Router();

// GET /api/menu - all menu items
router.get('/', async (req, res) => {
  try {
    const rows = await getSheetData('Menu', 'A:F');
    if (rows.length < 2) {
      return res.json([]);
    }

    const headers = rows[0];
    const data = rows.slice(1).map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || '';
      });
      obj._rowIndex = index;
      return obj;
    });

    res.json(data);
  } catch (err) {
    console.error('Error fetching menu:', err.message);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// POST /api/menu - add new menu item
router.post('/', async (req, res) => {
  try {
    const { category, item, price, description, available, image_url } = req.body;

    if (!category || !item || price === undefined) {
      return res.status(400).json({ error: 'category, item, and price are required' });
    }

    const values = [
      category,
      item,
      String(price),
      description || '',
      available !== undefined ? String(available) : 'TRUE',
      image_url || '',
    ];

    await appendRow('Menu', values);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error adding menu item:', err.message);
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// PATCH /api/menu/:rowIndex - update menu item at row
router.patch('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (isNaN(rowIndex) || rowIndex < 0) {
      return res.status(400).json({ error: 'Invalid row index' });
    }

    // Get current row data to merge with updates
    const rows = await getSheetData('Menu', 'A:F');
    if (rowIndex + 1 >= rows.length) {
      return res.status(404).json({ error: 'Row not found' });
    }

    const headers = rows[0];
    const currentRow = rows[rowIndex + 1]; // +1 for header

    const { category, item, price, description, available, image_url } = req.body;

    const updatedValues = [
      category !== undefined ? category : (currentRow[0] || ''),
      item !== undefined ? item : (currentRow[1] || ''),
      price !== undefined ? String(price) : (currentRow[2] || ''),
      description !== undefined ? description : (currentRow[3] || ''),
      available !== undefined ? String(available) : (currentRow[4] || ''),
      image_url !== undefined ? image_url : (currentRow[5] || ''),
    ];

    await updateRow('Menu', rowIndex, updatedValues);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating menu item:', err.message);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE /api/menu/:rowIndex - delete menu item
router.delete('/:rowIndex', async (req, res) => {
  try {
    const rowIndex = parseInt(req.params.rowIndex, 10);
    if (isNaN(rowIndex) || rowIndex < 0) {
      return res.status(400).json({ error: 'Invalid row index' });
    }

    await deleteRow('Menu', rowIndex);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting menu item:', err.message);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

export default router;
