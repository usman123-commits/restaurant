/**
 * One-time: move old free-text handoff reasons into the new shape
 *   reason      -> one of: dashboard, cancellation, modification, talk_to_staff, complaint
 *   description -> the original free text
 *
 *   node server/scripts/backfillHandoffReason.js                  # dry run: report only
 *   node server/scripts/backfillHandoffReason.js --apply          # write the confident ones
 *   node server/scripts/backfillHandoffReason.js --set <id>=complaint,<id>=talk_to_staff
 *                                                                 # write your decisions
 *
 * Only handoffs whose reason is not already a valid key are touched. The original
 * text is kept in `description` (unless description already has text). Flagged rows
 * are never written by --apply; until you --set them they show under "Other".
 * Safe to re-run.
 */
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectDB } from '../db.js';
import { Handoff } from '../models.js';
import { HANDOFF_REASON_KEYS, classifyLegacyReason } from '../shared/handoffReasons.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const setArg = args[args.indexOf('--set') + 1];
const MANUAL = args.includes('--set') && setArg
  ? Object.fromEntries(setArg.split(',').map((pair) => pair.split('=').map((s) => s.trim())))
  : null;

function update(h, key) {
  const $set = { reason: key };
  if (!String(h.description ?? '').trim() && String(h.reason ?? '').trim()) $set.description = h.reason;
  return $set;
}

async function main() {
  if (MANUAL) {
    for (const [id, key] of Object.entries(MANUAL)) {
      if (!HANDOFF_REASON_KEYS.includes(key)) throw new Error(`Invalid reason for ${id}: "${key}" (use ${HANDOFF_REASON_KEYS.join(', ')})`);
      if (!mongoose.Types.ObjectId.isValid(id)) throw new Error(`Invalid handoff id: "${id}"`);
    }
  }

  await connectDB();
  const pending = await Handoff.find({ reason: { $nin: HANDOFF_REASON_KEYS } }).sort({ timestamp: -1 }).lean();

  if (MANUAL) {
    const byId = Object.fromEntries(pending.map((h) => [String(h._id), h]));
    const ops = Object.entries(MANUAL).map(([id, key]) => {
      const h = byId[id];
      if (!h) return null;
      return { updateOne: { filter: { _id: h._id }, update: { $set: update(h, key) } } };
    }).filter(Boolean);
    const skipped = Object.keys(MANUAL).length - ops.length;
    if (ops.length) {
      const res = await Handoff.bulkWrite(ops);
      console.log(`Set reason on ${res.modifiedCount} handoffs.`);
    }
    if (skipped) console.log(`${skipped} id(s) not found or already have a valid reason.`);
    return;
  }

  const confident = [];
  const flagged = [];
  for (const h of pending) {
    const c = classifyLegacyReason(h.reason);
    if (c.confident) confident.push({ h, key: c.key });
    else flagged.push({ h, suggestion: c.key || 'talk_to_staff', why: c.key ? 'matches more than one category' : 'no keyword matched' });
  }

  console.log(`Handoffs without a valid reason: ${pending.length}`);
  for (const key of HANDOFF_REASON_KEYS) {
    console.log(`  confident ${key.padEnd(13)}: ${confident.filter((c) => c.key === key).length}`);
  }
  console.log(`  needs your review      : ${flagged.length}`);

  if (flagged.length) {
    console.log('\nReview these (they show under "Other" until you decide):');
    for (const { h, suggestion, why } of flagged) {
      const when = h.timestamp ? new Date(h.timestamp).toISOString().slice(0, 16).replace('T', ' ') : '?';
      console.log(`  ${h._id}  ${when}  ${h.profileName || h.phone}  | "${h.reason ?? ''}"  | suggest ${suggestion} (${why})`);
    }
    const example = flagged.slice(0, 2).map(({ h, suggestion }) => `${h._id}=${suggestion}`).join(',');
    console.log(`\nDecide with: node server/scripts/backfillHandoffReason.js --set ${example}`);
  }

  if (!APPLY) {
    console.log('\nDry run -- nothing written. Re-run with --apply to write the confident ones.');
    return;
  }

  const ops = confident.map(({ h, key }) => ({
    updateOne: {
      // re-check the reason is still the old value, so a concurrent write is never overwritten
      filter: { _id: h._id, reason: h.reason ?? null },
      update: { $set: update(h, key) },
    },
  }));
  if (ops.length) {
    const res = await Handoff.bulkWrite(ops);
    console.log(`\nWrote reason on ${res.modifiedCount} handoffs.`);
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (err) => {
    console.error('Backfill failed:', err.message);
    await mongoose.disconnect();
    process.exit(1);
  });
