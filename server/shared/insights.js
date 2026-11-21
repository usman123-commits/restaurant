// Insights page + live board: pure functions over orders / spends (no database, no browser).
// Tested in test/insights.test.js. Times are bucketed in the restaurant's time zone.
import { isDineIn } from './orderTabs.js';

export const TZ = 'Asia/Karachi';
const DAY = 24 * 60 * 60 * 1000;

// WhatsApp bot = 'delivery', dashboard phone orders = 'phone_call', dine-in by type or old text
export function orderKind(o) {
  if (isDineIn(o)) return 'dine_in';
  return o?.orderType === 'phone_call' ? 'on_call' : 'whatsapp';
}

export const KIND_LABEL = { whatsapp: 'WhatsApp', on_call: 'On Call', dine_in: 'Dine In' };

const counts = (o) => o && o.status !== 'cancelled'; // cancelled orders bring no money
const amount = (o) => Number(o?.totalAmount) || 0;

// "2026-10-18" in the restaurant's time zone
export const dayKey = (d, tz = TZ) => new Date(d).toLocaleDateString('en-CA', { timeZone: tz });
const monthKey = (d, tz = TZ) => dayKey(d, tz).slice(0, 7);

// Revenue per order kind and spends, per day (ranges up to ~2 months) or per month.
// -> { bucket, rows: [{ key, label, whatsapp, on_call, dine_in, revenue, spends, net }], totals }
export function moneySeries(orders, spends, { from, to, tz = TZ } = {}) {
  const byMonth = to - from > 62 * DAY;
  const keyOf = (d) => (byMonth ? monthKey(d, tz) : dayKey(d, tz));
  const rows = new Map();
  // every bucket in the range, so empty days show as zero
  for (let t = +from; t < +to; t += byMonth ? 28 * DAY : DAY) {
    const k = keyOf(t);
    if (!rows.has(k)) rows.set(k, { key: k, whatsapp: 0, on_call: 0, dine_in: 0, spends: 0 });
  }
  const lastKey = keyOf(+to - 1);
  if (!rows.has(lastKey)) rows.set(lastKey, { key: lastKey, whatsapp: 0, on_call: 0, dine_in: 0, spends: 0 });
  const row = (d) => rows.get(keyOf(d));
  for (const o of orders) {
    if (!counts(o)) continue;
    const r = row(o.timestamp);
    if (r) r[orderKind(o)] += amount(o);
  }
  for (const s of spends) {
    const r = row(s.timestamp);
    if (r) r.spends += Number(s.amount) || 0;
  }
  const label = (k) =>
    byMonth
      ? new Date(`${k}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      : new Date(`${k}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const out = [...rows.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((r) => {
      const revenue = r.whatsapp + r.on_call + r.dine_in;
      return { ...r, label: label(r.key), revenue, net: revenue - r.spends };
    });
  const sum = (f) => out.reduce((s, r) => s + r[f], 0);
  return {
    bucket: byMonth ? 'month' : 'day',
    rows: out,
    totals: { whatsapp: sum('whatsapp'), on_call: sum('on_call'), dine_in: sum('dine_in'), revenue: sum('revenue'), spends: sum('spends'), net: sum('net') },
  };
}

// Spends over time for the spends graph: per day and per week (weeks start Monday), each with
// its biggest entries. A bucket whose top entry is a one-off (rent, salaries: at least twice the
// usual bucket and Rs. 10,000+) gets `highlight` so the graph can label it.
// -> { daily: [{ key, label, amount, count, entries, highlight }], weekly: [...same] }
export function spendSeries(spends, { from, to, tz = TZ } = {}) {
  const days = new Map();
  for (let t = +from; t < +to; t += DAY) days.set(dayKey(t, tz), []);
  const last = dayKey(+to - 1, tz);
  if (!days.has(last)) days.set(last, []);
  for (const s of spends) {
    const list = days.get(dayKey(s.timestamp, tz));
    if (list) list.push({ category: s.category || 'Other', description: s.description || '', amount: Number(s.amount) || 0 });
  }
  const noon = (k) => new Date(`${k}T12:00:00Z`);
  const fmtDay = (k) => noon(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekOf = (k) => {
    const d = noon(k);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const bucket = (key, label, entries) => {
    const sorted = [...entries].sort((a, b) => b.amount - a.amount);
    return { key, label, amount: sorted.reduce((s, e) => s + e.amount, 0), count: sorted.length, entries: sorted.slice(0, 6) };
  };
  const sortedDays = [...days].sort(([a], [b]) => a.localeCompare(b));
  const daily = sortedDays.map(([k, list]) => bucket(k, fmtDay(k), list));
  const weeks = new Map();
  for (const [k, list] of sortedDays) {
    const w = weekOf(k);
    weeks.set(w, (weeks.get(w) || []).concat(list));
  }
  const weekly = [...weeks].map(([k, list]) => bucket(k, `Week of ${fmtDay(k)}`, list));
  const flag = (rows) => {
    const vals = rows.map((r) => r.amount).filter(Boolean).sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
    return rows.map((r) => {
      const top = r.entries[0];
      return top && top.amount >= 10000 && top.amount >= 2 * median ? { ...r, highlight: { amount: top.amount, category: top.category } } : r;
    });
  };
  return { daily: flag(daily), weekly: flag(weekly) };
}

// Spends per category, biggest first (count = number of entries)
export function spendsByCategory(spends) {
  const m = new Map();
  for (const s of spends) {
    const c = m.get(s.category || 'Other') || { category: s.category || 'Other', amount: 0, count: 0 };
    c.amount += Number(s.amount) || 0;
    c.count += 1;
    m.set(c.category, c);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

// Orders and revenue per delivery area (WhatsApp + On Call; dine-in has no area)
export function areaStats(orders) {
  const m = new Map();
  for (const o of orders) {
    if (!counts(o) || orderKind(o) === 'dine_in') continue;
    const area = o.deliveryArea || 'Unknown / other';
    const a = m.get(area) || { area, orders: 0, revenue: 0, deliveryCharges: 0 };
    a.orders += 1;
    a.revenue += amount(o);
    a.deliveryCharges += Number(o.deliveryCharge) || 0;
    m.set(area, a);
  }
  return [...m.values()]
    .map((a) => ({ ...a, avgOrder: a.orders ? Math.round(a.revenue / a.orders) : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

const realPhone = (p) => /\d{7,}/.test(String(p || '')) && !/dine|not_provided/i.test(String(p));

// Customers in the range: new (first order ever in the range) vs returning, the top spenders,
// and who ordered before but not in the last `lapsedDays` days (to win back).
// allOrders: every order (to know each customer's first and last order); range: { from, to }.
export function customerStats(allOrders, { from, to, now = new Date(), lapsedDays = 30 } = {}) {
  const people = new Map();
  for (const o of allOrders) {
    if (!counts(o) || orderKind(o) === 'dine_in' || !realPhone(o.phone)) continue;
    const t = new Date(o.timestamp);
    const p = people.get(o.phone) || { phone: o.phone, name: '', first: t, last: t, orders: 0, spend: 0, inRange: 0, rangeSpend: 0, demo: false };
    if (o.profileName && !/dine-in customer/i.test(o.profileName)) p.name = o.profileName;
    if (t < p.first) p.first = t;
    if (t > p.last) p.last = t;
    p.orders += 1;
    p.spend += amount(o);
    if (t >= from && t < to) {
      p.inRange += 1;
      p.rangeSpend += amount(o);
    }
    if (o.demo) p.demo = true;
    people.set(o.phone, p);
  }
  const all = [...people.values()];
  const active = all.filter((p) => p.inRange > 0);
  const isNew = (p) => p.first >= from && p.first < to;
  const lapsedSince = new Date(+now - lapsedDays * DAY);
  return {
    total: active.length,
    new: active.filter(isNew).length,
    returning: active.filter((p) => !isNew(p)).length,
    top: [...active].sort((a, b) => b.rangeSpend - a.rangeSpend).slice(0, 10)
      .map((p) => ({ phone: p.phone, name: p.name, orders: p.inRange, spend: p.rangeSpend, last: p.last, demo: p.demo })),
    lapsed: all.filter((p) => p.last < lapsedSince).sort((a, b) => b.spend - a.spend).slice(0, 10)
      .map((p) => ({ phone: p.phone, name: p.name, orders: p.orders, spend: p.spend, last: p.last, daysAgo: Math.floor((+now - p.last) / DAY), demo: p.demo })),
  };
}

// Live board: orders being prepared or on the way, oldest first, with how long they have waited.
// late: preparing for more than lateMinutes, or on the way longer than the area's rider time + 15.
export function liveBoard(orders, { now = new Date(), lateMinutes = 40 } = {}) {
  const mins = (a, b) => Math.max(0, Math.round((+b - +a) / 60000));
  return orders
    .filter((o) => ['preparing', 'on_the_way'].includes(o.status))
    .map((o) => {
      const placed = new Date(o.timestamp);
      const since = [...(o.statusHistory || [])].reverse().find((h) => h.status === o.status)?.at;
      const inStatus = mins(since ? new Date(since) : placed, now);
      const total = mins(placed, now);
      const late = o.status === 'preparing' ? inStatus > lateMinutes : inStatus > (Number(o.deliveryMinutes) || 20) + 15;
      return {
        _id: String(o._id), orderId: o.orderId, status: o.status, kind: orderKind(o),
        name: o.profileName || '', phone: o.phone, area: o.deliveryArea || null,
        items: (o.items || []).map((i) => `${i.qty || 1}x ${i.name}`).join(', '),
        totalAmount: amount(o), placed, minutesTotal: total, minutesInStatus: inStatus, late, demo: Boolean(o.demo),
      };
    })
    .sort((a, b) => a.placed - b.placed);
}
