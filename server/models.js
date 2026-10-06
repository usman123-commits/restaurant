import mongoose from 'mongoose';
import { HANDOFF_REASON_KEYS } from './shared/handoffReasons.js';
import { ORDER_TYPES } from './shared/orderTabs.js';

const { Schema } = mongoose;

// bufferCommands: false → fail immediately if DB not connected (no silent 10s hang)
const schemaOpts = { timestamps: true, bufferCommands: false };

// ─── MenuItem ────────────────────────────────────────────────────────────────
const menuItemSchema = new Schema({
  category:    { type: String, required: true },
  item:        { type: String, required: true },
  price:       { type: Number, required: true },
  description: { type: String, default: '' },
  available:   { type: Boolean, default: true },
  image_url:   { type: String, default: '' },
}, schemaOpts);

export const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);

// ─── Order ───────────────────────────────────────────────────────────────────
const orderSchema = new Schema({
  orderId:         { type: String, required: true, unique: true },
  timestamp:       { type: Date, default: Date.now },
  phone:           { type: String, default: 'not_provided' },
  profileName:     { type: String, default: 'Dine-In Customer' },
  items:           [{ name: String, qty: Number, price: Number }],
  totalAmount:     { type: Number, default: 0 },
  deliveryAddress: { type: String, default: 'Dine In' },
  // One of ORDER_TYPES (server/shared/orderTabs.js). No default on purpose: a missing
  // value means "unknown" and the dashboard falls back to guessing from the address.
  orderType:       { type: String, enum: ORDER_TYPES },
  status:          { type: String, enum: ['preparing', 'on_the_way', 'delivered', 'cancelled'], default: 'preparing' },
  // every status change with its time (who: 'bot' = WhatsApp agent, 'dashboard' = this app).
  // Orders from before 2026-10-06 have none.
  statusHistory:   [{ _id: false, status: String, at: Date, by: String }],
  notes:           { type: String, default: '' },
}, schemaOpts);

// Keyset pagination (server/lib/paging.js).
orderSchema.index({ timestamp: -1, _id: -1 });
orderSchema.index({ status: 1, timestamp: -1, _id: -1 });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ─── Conversation ─────────────────────────────────────────────────────────────
const conversationSchema = new Schema({
  phone:       { type: String, required: true, index: true },
  profileName: { type: String, default: '' },
  message:     { type: String, default: '' },
  role:        { type: String, default: '' },
  timestamp:   { type: Date, default: Date.now },
  sessionId:   { type: String, default: '' },
  turnId:      { type: String, default: null }, // the bot's turn (trace) -- written by the agent
}, schemaOpts);

// Serves "latest N messages for a phone" and the cursor for "load older".
conversationSchema.index({ phone: 1, timestamp: -1, _id: -1 });

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

// ─── Handoff ─────────────────────────────────────────────────────────────────
const handoffSchema = new Schema({
  timestamp:   { type: Date, default: Date.now },
  phone:       { type: String, required: true },
  profileName: { type: String, default: '' },
  // One of HANDOFF_REASON_KEYS (server/shared/handoffReasons.js). Free text goes in description.
  reason:      { type: String, enum: HANDOFF_REASON_KEYS },
  description: { type: String, default: '' },
  lastMessage: { type: String, default: 'none' },
  status:      { type: String, enum: ['active', 'resolved'], default: 'active' },
  resolvedAt:  { type: Date },
  note:        { type: String, default: '' },
  assignedTo:  { type: String, default: '' },
}, schemaOpts);

// Keyset pagination (server/lib/paging.js) and the active-phones lookup.
handoffSchema.index({ timestamp: -1, _id: -1 });
handoffSchema.index({ status: 1, timestamp: -1, _id: -1 });

export const Handoff = mongoose.models.Handoff || mongoose.model('Handoff', handoffSchema);

// ─── Spend ───────────────────────────────────────────────────────────────────
const spendSchema = new Schema({
  timestamp:     { type: Date, default: Date.now },
  description:   { type: String, required: true },
  category:      { type: String, default: 'Other' },
  amount:        { type: Number, required: true },
  paymentMethod: { type: String, default: 'Cash' },
}, schemaOpts);

// Keyset pagination (server/lib/paging.js).
spendSchema.index({ timestamp: -1, _id: -1 });

export const Spend = mongoose.models.Spend || mongoose.model('Spend', spendSchema);

// ─── ConversationRead ──────────────────────────────────────────────────────
// "Seen up to" per customer, shared by everyone using the dashboard (one login).
// Customer messages newer than lastReadAt are unread. A phone without a row counts
// as read up to the moment unread tracking started (botconfigs UNREAD_SINCE).
const conversationReadSchema = new Schema({
  phone:      { type: String, required: true, unique: true },
  lastReadAt: { type: Date, required: true },
}, schemaOpts);

export const ConversationRead = mongoose.models.ConversationRead || mongoose.model('ConversationRead', conversationReadSchema);

// ─── BlockedNumber ───────────────────────────────────────────────────────────
// Numbers the WhatsApp bot ignores (managed in Handoffs -> Blocked numbers).
// phone: digits with country code, as WhatsApp sends it ("923115185775").
const blockedNumberSchema = new Schema({
  phone:       { type: String, required: true, unique: true },
  profileName: { type: String, default: '' },
  note:        { type: String, default: '' },
}, schemaOpts);

export const BlockedNumber = mongoose.models.BlockedNumber || mongoose.model('BlockedNumber', blockedNumberSchema);

// ─── Feedback ─────────────────────────────────────────────────────────────────
// A bot reply the restaurant reported as wrong (Conversations page). Reviewed in the Zelvop console.
const feedbackSchema = new Schema({
  conversationId:  { type: String, required: true, unique: true }, // the bot message
  turnId:          { type: String, default: null },  // the bot's trace (turns collection)
  phone:           { type: String, default: '' },
  profileName:     { type: String, default: '' },
  customerMessage: { type: String, default: '' },
  botReply:        { type: String, default: '' },
  repliedAt:       { type: Date },
  note:            { type: String, default: '' },    // what was wrong / what the bot should have said
  source:          { type: String, default: 'dashboard' },
}, { ...schemaOpts, collection: 'feedback' });

export const Feedback = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);

// ─── BotConfig ───────────────────────────────────────────────────────────────
const botConfigSchema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: '' },
}, schemaOpts);

export const BotConfig = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
