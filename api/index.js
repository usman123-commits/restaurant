import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import authMiddleware from '../server/middleware/auth.js';
import authRoutes from '../server/routes/auth.js';
import ordersRoutes from '../server/routes/orders.js';
import conversationsRoutes from '../server/routes/conversations.js';
import menuRoutes from '../server/routes/menu.js';
import analyticsRoutes from '../server/routes/analytics.js';
import handoffsRoutes from '../server/routes/handoffs.js';
import settingsRoutes from '../server/routes/settings.js';
import spendRoutes from '../server/routes/spend.js';
import blockedRoutes from '../server/routes/blocked.js';

// ─── Serverless-safe MongoDB connection ──────────────────────────────────────
// In serverless (Vercel), the module is re-imported per cold start but the
// Node.js module cache is shared across warm invocations within the same
// function instance. We cache the connection promise on `global` so multiple
// concurrent requests in the same instance don't open duplicate connections.

let cachedPromise = global._mongooseConnectPromise ?? null;

async function connectDB() {
  // Already connected — reuse the existing connection
  if (mongoose.connection.readyState === 1) return;

  // A connection attempt is already in flight — wait for it
  if (cachedPromise) return cachedPromise;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

  cachedPromise = mongoose.connect(uri, {
    // These options are critical for serverless environments
    serverSelectionTimeoutMS: 10000, // give up finding a server after 10s
    socketTimeoutMS: 45000,          // close idle sockets after 45s
    maxPoolSize: 10,                 // keep up to 10 connections in the pool
    bufferCommands: false,           // don't buffer — fail fast if not connected
  });

  global._mongooseConnectPromise = cachedPromise;

  try {
    await cachedPromise;
    console.log('MongoDB connected successfully.');
  } catch (err) {
    // Reset so the next request can retry
    cachedPromise = null;
    global._mongooseConnectPromise = null;
    throw err;
  }
}

// ─── Express app ─────────────────────────────────────────────────────────────
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
app.use('/api/spend', spendRoutes);
app.use('/api/blocked', blockedRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', dbState: mongoose.connection.readyState });
});

// ─── Vercel serverless handler ────────────────────────────────────────────────
// Vercel calls this exported function for every request.
// We ensure DB is connected before passing the request to Express.
export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    return res.status(503).json({ error: 'Database unavailable', detail: err.message });
  }
  return app(req, res);
}
