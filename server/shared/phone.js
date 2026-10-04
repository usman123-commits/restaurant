// Phone numbers as WhatsApp sends them: digits with country code ("923115185775").
// Same rules as the WhatsApp bridge, so a number blocked here matches what it receives.
// Plain JS, no Node or browser imports (used by the API and the dashboard).

// "03115185775" / "+92 311 5185775" / "0092-311-5185775" -> "923115185775"
export function normalizeNumber(n) {
  const d = String(n ?? '').replace(/\D/g, '');
  if (d.startsWith('0092')) return d.slice(2);
  if (d.startsWith('03') && d.length === 11) return `92${d.slice(1)}`;
  if (d.startsWith('3') && d.length === 10) return `92${d}`;
  return d;
}

export function isValidNumber(n) {
  const d = normalizeNumber(n);
  return d.length >= 10 && d.length <= 15;
}
