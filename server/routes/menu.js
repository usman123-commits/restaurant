import { Router } from 'express';
import { MenuItem } from '../models.js';

const router = Router();

// GET /api/menu - all menu items
router.get('/', async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1, item: 1 }).lean();
    res.json(items);
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

    const menuItem = await MenuItem.create({
      category,
      item,
      price: Number(price),
      description: description || '',
      available:   available !== undefined ? Boolean(available) : true,
      image_url:   image_url || '',
    });

    res.status(201).json({ success: true, menuItem });
  } catch (err) {
    console.error('Error adding menu item:', err.message);
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// PATCH /api/menu/:id - update menu item by MongoDB _id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Coerce types properly
    if (updates.price !== undefined) updates.price = Number(updates.price);
    if (updates.available !== undefined) updates.available = updates.available === 'true' || updates.available === true;

    const menuItem = await MenuItem.findByIdAndUpdate(id, updates, { new: true });
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ success: true, menuItem });
  } catch (err) {
    console.error('Error updating menu item:', err.message);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE /api/menu/:id - delete menu item by MongoDB _id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await MenuItem.findByIdAndDelete(id);
    if (!result) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting menu item:', err.message);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

export default router;
