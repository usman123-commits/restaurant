// Single source of truth for handoff reasons.
// Imported by the API (validation, filters), the dashboard (tabs, labels) and
// the backfill script. Lives under server/ because Vercel only bundles server/**.
// Plain JS, no Node or browser imports.
//
// `reason` stores the KEY. The free text the AI writes goes in `description`.

export const HANDOFF_REASONS = [
  { key: 'dashboard',     label: 'Handed off by dashboard' },
  { key: 'cancellation',  label: 'Cancellation' },
  { key: 'modification',  label: 'Modification' },
  { key: 'talk_to_staff', label: 'Wants to talk to staff' },
  { key: 'complaint',     label: 'Complaint' },
];

export const HANDOFF_REASON_KEYS = HANDOFF_REASONS.map((r) => r.key);

// Rows whose reason isn't one of the keys (written before this schema existed,
// or by a writer that sent something else). Shown under their own tab so they
// never silently disappear from every filter.
export const OTHER_REASON = { key: 'other', label: 'Other' };

const LABELS = Object.fromEntries([...HANDOFF_REASONS, OTHER_REASON].map((r) => [r.key, r.label]));

export function isKnownReason(reason) {
  return HANDOFF_REASON_KEYS.includes(reason);
}

export function reasonLabel(reason) {
  return LABELS[isKnownReason(reason) ? reason : 'other'];
}

// Best-effort mapping of an old free-text reason to a key, for data written before
// this schema (backfill script, Sheets import). Returns { key, confident }:
// confident = exactly one category's keywords matched. Includes common Roman Urdu.
const LEGACY_KEYWORDS = [
  ['dashboard',     /dashboard/],
  ['cancellation',  /cancel|cancell|cansel|band kar|nahi chahiye/],
  ['modification',  /modif|change|edit|update (the |my )?order|badal|tabdeel|add .* to (the |my )?order/],
  ['complaint',     /complain|complaint|shikayat|late|cold|thand|wrong|galat|bad|kharab|refund|angry|not (happy|satisfied)/],
  ['talk_to_staff', /human|staff|talk|speak|manager|person|agent|call me|baat kar|insaan|banda/],
];

export function classifyLegacyReason(text) {
  const t = String(text ?? '').toLowerCase();
  if (isKnownReason(t)) return { key: t, confident: true };
  const hits = LEGACY_KEYWORDS.filter(([, re]) => re.test(t)).map(([key]) => key);
  return { key: hits[0] || null, confident: hits.length === 1 };
}
