import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import authMiddleware from '../server/middleware/auth.js';
import authRoutes from '../server/routes/auth.js';
import ordersRoutes from '../server/routes/orders.js';
import conversationsRoutes from '../server/routes/conversations.js';
import menuRoutes from '../server/routes/menu.js';
import analyticsRoutes from '../server/routes/analytics.js';
import handoffsRoutes from '../server/routes/handoffs.js';
import settingsRoutes from '../server/routes/settings.js';

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

app.use('/api', authRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/conversations', conversationsRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/handoffs', handoffsRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
