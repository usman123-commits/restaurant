import mongoose from 'mongoose';

const { Schema } = mongoose;

// ─── MenuItem ────────────────────────────────────────────────────────────────
const menuItemSchema = new Schema({
  category:    { type: String, required: true },
  item:        { type: String, required: true },
  price:       { type: Number, required: true },
  description: { type: String, default: '' },
  available:   { type: Boolean, default: true },
  image_url:   { type: String, default: '' },
}, { timestamps: true });

export const MenuItem = mongoose.models.MenuItem || mongoose.model('MenuItem', menuItemSchema);

// ─── Order ───────────────────────────────────────────────────────────────────
const orderSchema = new Schema({
  orderId:         { type: String, required: true, unique: true }, // e.g. OTTO-1785414632827
  timestamp:       { type: Date, default: Date.now },
  phone:           { type: String, default: 'not_provided' },
  profileName:     { type: String, default: 'Dine-In Customer' },
  items:           [{ name: String, qty: Number, price: Number }],  // proper array, not JSON string
  totalAmount:     { type: Number, default: 0 },
  deliveryAddress: { type: String, default: 'Dine In' },
  status:          { type: String, enum: ['preparing', 'on_the_way', 'delivered', 'cancelled'], default: 'preparing' },
  notes:           { type: String, default: '' },
}, { timestamps: true });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

// ─── Conversation (individual message) ───────────────────────────────────────
const conversationSchema = new Schema({
  phone:       { type: String, required: true, index: true },
  profileName: { type: String, default: '' },
  message:     { type: String, default: '' },
  role:        { type: String, default: '' },    // 'user' | 'assistant' | etc.
  timestamp:   { type: Date, default: Date.now },
  sessionId:   { type: String, default: '' },
}, { timestamps: true });

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
}, { timestamps: true });

export const Handoff = mongoose.models.Handoff || mongoose.model('Handoff', handoffSchema);

// ─── Spend ───────────────────────────────────────────────────────────────────
const spendSchema = new Schema({
  timestamp:     { type: Date, default: Date.now },
  description:   { type: String, required: true },
  category:      { type: String, default: 'Other' },
  amount:        { type: Number, required: true },
  paymentMethod: { type: String, default: 'Cash' },
}, { timestamps: true });

export const Spend = mongoose.models.Spend || mongoose.model('Spend', spendSchema);

// ─── BotConfig (key-value settings store) ────────────────────────────────────
const botConfigSchema = new Schema({
  key:   { type: String, required: true, unique: true },
  value: { type: String, default: '' },
}, { timestamps: true });

export const BotConfig = mongoose.models.BotConfig || mongoose.model('BotConfig', botConfigSchema);
