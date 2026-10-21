import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './db.js';
import authMiddleware from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import ordersRoutes from './routes/orders.js';
import conversationsRoutes from './routes/conversations.js';
import menuRoutes from './routes/menu.js';
import analyticsRoutes from './routes/analytics.js';
import handoffsRoutes from './routes/handoffs.js';
import settingsRoutes from './routes/settings.js';
import spendRoutes from './routes/spend.js';
import blockedRoutes from './routes/blocked.js';
import feedbackRoutes from './routes/feedback.js';
import insightsRoutes from './routes/insights.js';

const app = express();
const PORT = process.env.PORT || 3001;

// API answers are never cached by the browser or Vercel, and carry no ETag: the app keeps
// its own copies (useStaleData + IndexedDB). With ETags the browser sent "changed since?"
// requests, the server answered 304 with an empty body, and a 304 that reached the app's
// fetch looked like a failure ("Unable to load analytics").
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

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
app.use('/api/spend', spendRoutes);
app.use('/api/blocked', blockedRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/insights', insightsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: 'mongodb' });
});

// Connect to MongoDB, then start server
async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  }
}

start();
