import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { initAuth } from './sheets.js';
import authMiddleware from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import conversationsRoutes from './routes/conversations.js';
import menuRoutes from './routes/menu.js';
import analyticsRoutes from './routes/analytics.js';
import handoffsRoutes from './routes/handoffs.js';
import settingsRoutes from './routes/settings.js';
import usageRoutes from './routes/usage.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Auth middleware (skips public paths)
app.use(authMiddleware);

// Routes
app.use('/api', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/handoffs', handoffsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/usage', usageRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Initialize Google Sheets auth, then start server
async function start() {
  try {
    await initAuth();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  }
}

start();
