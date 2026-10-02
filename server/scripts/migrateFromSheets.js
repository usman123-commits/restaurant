/**
 * Migration Script: Google Sheets → MongoDB
 *
 * Run once to transfer all existing data from Google Sheets into MongoDB.
 *
 * Usage:
 *   node server/scripts/migrateFromSheets.js
 *
 * Prerequisites:
 *   - MONGODB_URI must be set in .env
 *   - Google Sheets credentials must still be configured (GOOGLE_CREDENTIALS_PATH + token.json)
 */

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { initAuth, getSheetData } from '../sheets.js';
import { MenuItem, Order, Conversation, Handoff, Spend, BotConfig } from '../models.js';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI is not set in .env');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] || ''; });
    return obj;
  });
}

function parseItems(itemsStr) {
  if (!itemsStr) return [];
  try {
    const parsed = JSON.parse(itemsStr);
    if (Array.isArray(parsed)) {
      return parsed.map((it) => ({
        name:  typeof it === 'object' ? (it.name || it.item || '') : String(it),
        qty:   Number(it.qty)   || 1,
        price: Number(it.price) || 0,
      }));
    }
  } catch {
    // Fallback: comma-separated string
    return itemsStr.split(',').map((s) => ({ name: s.trim(), qty: 1, price: 0 })).filter((it) => it.name);
  }
  return [];
}

// ─── Migration Functions ──────────────────────────────────────────────────────

async function migrateMenu() {
  console.log('\n📋 Migrating Menu...');
  const rows = await getSheetData('Menu', 'A:Z');
  const data = rowsToObjects(rows);

  if (!data.length) { console.log('   No menu data found.'); return; }

  const docs = data.map((row) => ({
    category:    row.category || row.Category || 'Uncategorized',
    item:        row.item     || row.Item     || '',
    price:       parseFloat(row.price || row.Price) || 0,
    description: row.description || row.Description || '',
    available:   row.available !== undefined
                   ? (String(row.available).toLowerCase() !== 'false' && row.available !== 'FALSE')
                   : true,
    image_url:   row.image_url || row.imageUrl || '',
  })).filter((d) => d.item);

  await MenuItem.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`   ✅ Inserted ${docs.length} menu items.`);
}

async function migrateOrders() {
  console.log('\n📦 Migrating Orders...');
  const rows = await getSheetData('Orders', 'A:I');
  const data = rowsToObjects(rows);

  if (!data.length) { console.log('   No orders data found.'); return; }

  const docs = data.map((row) => ({
    orderId:         row.orderId         || `OTTO-${Date.now()}-${Math.random()}`,
    timestamp:       row.timestamp       ? new Date(row.timestamp) : new Date(),
    phone:           row.phone           || 'not_provided',
    profileName:     row.profileName     || 'Unknown',
    items:           parseItems(row.items),
    totalAmount:     parseFloat(row.totalAmount) || 0,
    deliveryAddress: row.deliveryAddress || 'Dine In',
    status:          row.status          || 'delivered',
    notes:           row.notes           || '',
  }));

  await Order.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`   ✅ Inserted ${docs.length} orders.`);
}

async function migrateConversations() {
  console.log('\n💬 Migrating Conversations...');
  const rows = await getSheetData('Conversations', 'A:F');
  const data = rowsToObjects(rows);

  if (!data.length) { console.log('   No conversations data found.'); return; }

  const docs = data.map((row) => ({
    phone:       row.phone       || '',
    profileName: row.profileName || '',
    message:     row.message     || '',
    role:        row.role        || '',
    timestamp:   row.timestamp   ? new Date(row.timestamp) : new Date(),
    sessionId:   row.sessionId   || '',
  })).filter((d) => d.phone);

  await Conversation.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`   ✅ Inserted ${docs.length} conversation messages.`);
}

async function migrateHandoffs() {
  console.log('\n🤝 Migrating Handoffs...');
  const rows = await getSheetData('Handoffs', 'A:I');
  const data = rowsToObjects(rows);

  if (!data.length) { console.log('   No handoffs data found.'); return; }

  const docs = data.map((row) => ({
    timestamp:   row.timestamp   ? new Date(row.timestamp) : new Date(),
    phone:       row.phone       || '',
    profileName: row.profileName || '',
    reason:      row.reason      || '',
    lastMessage: row.lastMessage || 'none',
    status:      (row.status === 'resolved' || row.status === 'active') ? row.status : 'active',
    resolvedAt:  row.resolvedAt  ? new Date(row.resolvedAt) : undefined,
    note:        row.note        || '',
    assignedTo:  row.assignedTo  || '',
  })).filter((d) => d.phone);

  await Handoff.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`   ✅ Inserted ${docs.length} handoffs.`);
}

async function migrateSpend() {
  console.log('\n💰 Migrating Spend...');
  const rows = await getSheetData('Spend', 'A:E');
  const data = rowsToObjects(rows);

  if (!data.length) { console.log('   No spend data found.'); return; }

  const docs = data.map((row) => ({
    timestamp:     row.timestamp     ? new Date(row.timestamp) : new Date(),
    description:   row.description   || 'Unknown',
    category:      row.category      || 'Other',
    amount:        parseFloat(row.amount) || 0,
    paymentMethod: row.paymentMethod || 'Cash',
  })).filter((d) => d.amount > 0);

  await Spend.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`   ✅ Inserted ${docs.length} spend records.`);
}

async function migrateBotConfig() {
  console.log('\n⚙️  Migrating BotConfig...');
  const rows = await getSheetData('BotConfig', 'A:B');

  if (!rows || rows.length < 1) { console.log('   No BotConfig data found.'); return; }

  const docs = rows.map((row) => ({ key: row[0], value: row[1] || '' })).filter((d) => d.key);

  for (const doc of docs) {
    await BotConfig.findOneAndUpdate({ key: doc.key }, { value: doc.value }, { upsert: true });
  }
  console.log(`   ✅ Upserted ${docs.length} config keys.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Starting migration: Google Sheets → MongoDB');
  console.log('   MongoDB URI:', MONGODB_URI.replace(/:\/\/.*@/, '://***@'));

  await mongoose.connect(MONGODB_URI);
  console.log('   MongoDB connected.');

  await initAuth();
  console.log('   Google Sheets auth initialized.');

  await migrateMenu();
  await migrateOrders();
  await migrateConversations();
  await migrateHandoffs();
  await migrateSpend();
  await migrateBotConfig();

  console.log('\n✅ Migration complete!');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
