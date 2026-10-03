import mongoose from 'mongoose';

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
  status:          { type: String, enum: ['preparing', 'on_the_way', 'delivered', 'cancelled'], default: 'preparing' },
  notes:           { type: String, default: '' },
}, schemaOpts);

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ─── Conversation ─────────────────────────────────────────────────────────────
const conversationSchema = new Schema({
  phone:       { type: String, required: true, index: true },
  profileName: { type: String, default: '' },
  message:     { type: String, default: '' },
  role:        { type: String, default: '' },
  timestamp:   { type: Date, default: Date.now },
  sessionId:   { type: String, default: '' },
}, schemaOpts);

// Serves "latest N messages for a phone" and the cursor for "load older".
conversationSchema.index({ phone: 1, timestamp: -1, _id: -1 });

export const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);

// ─── Handoff ─────────────────────────────────────────────────────────────────
const handoffSchema = new Schema({
  timestamp:   { type: Date, default: Date.now },
  phone:       { type: String, required: true },
  profileName: { type: String, default: '' },
  reason:      { type: String, default: '' },
  lastMessage: { type: String, default: 'none' },
  status:      { type: String, enum: ['active', 'resolved'], default: 'active' },
  resolvedAt:  { type: Date },
  note:        { type: String, default: '' },
  assignedTo:  { type: String, default: '' },
}, schemaOpts);

export const Handoff = mongoose.models.Handoff || mongoose.model('Handoff', handoffSchema);

// ─── Spend ───────────────────────────────────────────────────────────────────
const spendSchema = new Schema({
  timestamp:     { type: Date, default: Date.now },
  description:   { type: String, required: true },
  category:      { type: String, default: 'Other' },
  amount:        { type: Number, required: true },
  paymentMethod: { type: String, default: 'Cash' },
}, schemaOpts);

export const Spend = mongoose.models.Spend || mongoose.model('Spend', spendSchema);

// ─── BotConfig ───────────────────────────────────────────────────────────────
const botConfigSchema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: '' },
}, schemaOpts);

export const BotConfig = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
