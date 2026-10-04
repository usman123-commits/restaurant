/**
 * One-time: label existing orders with orderType ('dine_in' | 'delivery').
 *
 *   node server/scripts/backfillOrderType.js                 # dry run: report only, writes nothing
 *   node server/scripts/backfillOrderType.js --apply         # write the confident labels
 *   node server/scripts/backfillOrderType.js --set OTTO-1=delivery,OTTO-2=dine_in
 *                                                            # write your decisions for flagged orders
 *
 * Only orders WITHOUT orderType are touched. Flagged (uncertain) orders are never
 * written by --apply; until you --set them they keep the old text-based guess, so
 * the dashboard behaves exactly as it does today for them.
 * Safe to re-run.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../db.js';
import { Order } from '../models.js';
import { ORDER_TYPES, guessDineInFromText } from '../shared/orderTabs.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const setArg = args[args.indexOf('--set') + 1];
const MANUAL = args.includes('--set') && setArg
  ? Object.fromEntries(setArg.split(',').map((pair) => pair.split('=').map((s) => s.trim())))
  : null;

const EXACT_DINE_IN_ADDRESS = /^dine[ -]?in$/i;

// Returns { type, reason } when confident, or { suggestion, reason } when a human should check.
function classify(order) {
  const address = String(order.deliveryAddress ?? '').trim();
  const fromWhatsApp = Boolean(order.jid); // the n8n bot stores the WhatsApp jid; manual orders don't
  const guessDineIn = guessDineInFromText(order);

  if (guessDineIn) {
    if (fromWhatsApp) {
      return { suggestion: 'delivery', reason: 'came from the WhatsApp bot (delivery-only) but text looks dine-in' };
    }
    if (EXACT_DINE_IN_ADDRESS.test(address)) {
      return { type: 'dine_in', reason: 'address is exactly "Dine In"' };
    }
    if (!/dine/i.test(address)) {
      return { suggestion: 'dine_in', reason: 'dine-in only because phone/name contains "dine"' };
    }
    return { suggestion: 'dine_in', reason: `address only contains "dine": "${address}"` };
  }

  if (!address) {
    return { suggestion: 'delivery', reason: 'no address at all' };
  }
  return { type: 'delivery', reason: 'has a real address, nothing dine-in about it' };
}

async function main() {
  if (MANUAL) {
    for (const [orderId, type] of Object.entries(MANUAL)) {
      if (!ORDER_TYPES.includes(type)) throw new Error(`Invalid type for ${orderId}: "${type}" (use ${ORDER_TYPES.join(' or ')})`);
    }
  }

  await connectDB();

  if (MANUAL) {
    const ops = Object.entries(MANUAL).map(([orderId, orderType]) => ({
      updateOne: { filter: { orderId }, update: { $set: { orderType } } },
    }));
    const res = await Order.bulkWrite(ops);
    console.log(`Set orderType on ${res.modifiedCount} of ${ops.length} orders (${ops.length - res.matchedCount} not found).`);
    return;
  }

  const pending = await Order.find({ orderType: { $in: [null, ''] } }).sort({ timestamp: -1 }).lean();
  const confident = { dine_in: [], delivery: [] };
  const flagged = [];
  for (const o of pending) {
    const c = classify(o);
    if (c.type) confident[c.type].push(o);
    else flagged.push({ o, ...c });
  }

  console.log(`Orders without orderType: ${pending.length}`);
  console.log(`  confident dine_in : ${confident.dine_in.length}`);
  console.log(`  confident delivery: ${confident.delivery.length}`);
  console.log(`  needs your review : ${flagged.length}`);

  if (flagged.length) {
    console.log('\nReview these (they keep the old guess until you decide):');
    for (const { o, suggestion, reason } of flagged) {
      const when = o.timestamp ? new Date(o.timestamp).toISOString().slice(0, 16).replace('T', ' ') : '?';
      console.log(`  ${o.orderId}  ${when}  ${o.profileName || '-'}  | address: "${o.deliveryAddress ?? ''}"  | suggest ${suggestion}: ${reason}`);
    }
    const example = flagged.slice(0, 2).map(({ o, suggestion }) => `${o.orderId}=${suggestion}`).join(',');
    console.log(`\nDecide with: node server/scripts/backfillOrderType.js --set ${example}`);
  }

  if (!APPLY) {
    console.log('\nDry run -- nothing written. Re-run with --apply to write the confident labels.');
    return;
  }

  const ops = [...confident.dine_in, ...confident.delivery].map((o) => ({
    updateOne: {
      // re-check orderType is still missing, so a concurrent write is never overwritten
      filter: { _id: o._id, orderType: { $in: [null, ''] } },
      update: { $set: { orderType: confident.dine_in.includes(o) ? 'dine_in' : 'delivery' } },
    },
  }));
  if (ops.length) {
    const res = await Order.bulkWrite(ops);
    console.log(`\nWrote orderType on ${res.modifiedCount} orders.`);
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('Backfill failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
