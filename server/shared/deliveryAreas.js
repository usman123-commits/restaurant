// Delivery areas the WhatsApp bot uses (otto-agent src/delivery.js reads botconfigs
// DELIVERY_AREAS; same shape). Plain JS, no Node or browser imports (used by the API and the
// Settings page).
//   { name, charge, minutes, aliases }
//   charge  -- delivery charge in Rs.
//   minutes -- rider time after the rider leaves (optional; no time is promised without it)
//   aliases -- other spellings customers write ("park view", "parview"); the name always counts

// The bot's built-in list -- what it uses until the list is saved on the Settings page.
export const DEFAULT_AREAS = [
  { name: 'New Mall', charge: 50, minutes: 5, aliases: ['new mall', 'newmall', 'nayi mall', 'nai mall'] },
  { name: 'Chatta Bakhtawar', charge: 100, minutes: 5, aliases: ['chatta bakhtawar', 'chatta bhakatwar', 'chattha bakhtawar', 'chata bakhtawar', 'bakhtawar', 'bhakatwar', 'chatta'] },
  { name: 'Parkview', charge: 200, minutes: 10, aliases: ['parkview', 'park view', 'parview', 'parkveiw', 'park veiw', 'parkviw'] },
  { name: 'Bahria Enclave', charge: 200, minutes: 10, aliases: ['bahria enclave', 'behria enclave', 'bahriya enclave', 'bahria enclve'] },
  { name: 'Malot', charge: 200, minutes: 15, aliases: ['malot', 'maalot', 'malout'] },
];

export const DEFAULT_PAYMENT = 'Payment cash on delivery hai -- order milne par rider ko de dein.';

const spellings = (s) =>
  String(s ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

// rows from the form (aliases may be a comma-separated string) -> { areas, errors }
export function validateAreas(rows) {
  const errors = [];
  const areas = [];
  const seen = new Set();
  if (!Array.isArray(rows)) return { areas, errors: ['No areas sent'] };
  rows.forEach((r, i) => {
    const row = `Row ${i + 1}`;
    const name = String(r?.name ?? '').trim();
    const chargeText = String(r?.charge ?? '').trim();
    const minutesText = String(r?.minutes ?? '').trim();
    const charge = Number(chargeText);
    const minutes = minutesText === '' ? null : Number(minutesText);
    if (!name) return errors.push(`${row}: area name is empty`);
    if (seen.has(name.toLowerCase())) return errors.push(`${row}: "${name}" is listed twice`);
    if (chargeText === '' || !Number.isInteger(charge) || charge < 0 || charge > 5000) {
      return errors.push(`${row} (${name}): charge must be a whole number of rupees (0 - 5000)`);
    }
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 180)) {
      return errors.push(`${row} (${name}): rider minutes must be 1 - 180, or empty`);
    }
    seen.add(name.toLowerCase());
    const aliases = [...new Set([name.toLowerCase(), ...(Array.isArray(r.aliases) ? r.aliases.map((a) => String(a).trim().toLowerCase()) : spellings(r.aliases))])].filter(Boolean);
    areas.push({ name, charge, minutes, aliases });
  });
  if (!areas.length && !errors.length) errors.push('Add at least one delivery area');
  return { areas, errors };
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Is this place (e.g. "Mlot" from the old menu category) already one of the areas?
export function findArea(areas, place) {
  const p = String(place ?? '').trim().toLowerCase();
  if (!p) return null;
  return (
    areas.find((a) =>
      [a.name, ...(Array.isArray(a.aliases) ? a.aliases : spellings(a.aliases))]
        .map((s) => String(s).trim().toLowerCase())
        .some((s) => s === p || (Math.min(s.length, p.length) >= 4 && lev(s, p) <= 1)),
    ) || null
  );
}
