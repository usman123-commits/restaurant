// Demo orders and spends, to see the Insights page and the live board before real data exists.
// Every record has demo: true (and "DEMO" in its name / description), so it can all be removed:
//   npm run demo:add      30 days of orders (WhatsApp / On Call / Dine In) + spends + 4 live orders
//   npm run demo:remove   deletes every demo order and spend (nothing else)
// Demo phones are 9230000001xx (regulars) and 92300000020x (stopped ordering) -- not real customers. Demo orders on the
// way are marked riderNotified, so the n8n rider pickup never messages them.
import 'dotenv/config';
import mongoose from 'mongoose';
import { DEFAULT_AREAS } from '../shared/deliveryAreas.js';

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const cmd = process.argv[2];
if (!['add', 'remove'].includes(cmd)) {
  console.log('usage: node server/scripts/demoData.js add | remove');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const orders = db.collection('orders');
const spends = db.collection('spends');

if (cmd === 'remove') {
  const o = await orders.deleteMany({ demo: true });
  const s = await spends.deleteMany({ demo: true });
  console.log(`removed ${o.deletedCount} demo orders and ${s.deletedCount} demo spends`);
  await mongoose.disconnect();
  process.exit(0);
}

if (await orders.countDocuments({ demo: true })) {
  console.log('demo data is already there -- run "npm run demo:remove" first');
  await mongoose.disconnect();
  process.exit(1);
}

// a fixed seed: the same demo data every time
let seed = 20261018;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[0][0];
};

const menu = (await db.collection('menuitems').find({ available: { $ne: false }, price: { $gt: 0 } }).toArray())
  .filter((m) => !/^\s*delivery\s*(charges?|fee|fees)?\s*$/i.test(m.category || ''));
if (!menu.length) throw new Error('no menu items found');
const areasDoc = await db.collection('botconfigs').findOne({ key: 'DELIVERY_AREAS' });
let areas = DEFAULT_AREAS;
try { if (areasDoc?.value) areas = JSON.parse(areasDoc.value); } catch { /* built-in list */ }

const NAMES = ['Ali', 'Ahmed', 'Sara', 'Hamza', 'Ayesha', 'Usman', 'Fatima', 'Bilal', 'Zainab', 'Hassan', 'Hira', 'Omar', 'Maryam', 'Saad', 'Iqra', 'Talha', 'Noor', 'Fahad', 'Amna', 'Danish'];
const customers = NAMES.map((n, i) => ({ name: `DEMO ${n}`, phone: `9230000001${String(i).padStart(2, '0')}` }));
const lapsedCustomers = ['Kamran', 'Sana', 'Waqas', 'Rabia'].map((n, i) => ({ name: `DEMO ${n}`, phone: `92300000020${i}` }));

// Pakistan time (UTC+5): opening hours 12 pm - 2 am, busiest 7 - 11 pm
const pktDayStart = (daysAgo) => {
  const now = new Date();
  const pkt = new Date(+now + 5 * 60 * MIN);
  const start = Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - 5 * 60 * MIN; // 00:00 PKT
  return start - daysAgo * DAY;
};
const orderTime = (daysAgo) => {
  const hour = weighted([[12, 2], [13, 3], [14, 2], [15, 1], [16, 1], [17, 2], [18, 3], [19, 5], [20, 7], [21, 7], [22, 5], [23, 3], [24, 2], [25, 1]]);
  return new Date(pktDayStart(daysAgo) + hour * 60 * MIN + between(0, 59) * MIN);
};

function makeOrder(at, kind, who, { status } = {}) {
  const lines = [];
  for (let i = 0; i < weighted([[1, 5], [2, 4], [3, 2]]); i++) {
    const m = pick(menu);
    const qty = weighted([[1, 6], [2, 3], [3, 1]]);
    lines.push({ name: m.item, qty, price: Number(m.price) });
  }
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const area = kind === 'dine_in' ? null : weighted(areas.map((a, i) => [a, [5, 3, 3, 2, 2][i] || 1]));
  const charge = area ? Number(area.charge) || 0 : 0;
  const finalStatus = status || (rand() < 0.05 ? 'cancelled' : 'delivered');
  const history = [{ status: 'preparing', at, by: 'demo' }];
  if (finalStatus === 'delivered' || finalStatus === 'on_the_way') {
    const left = new Date(+at + between(12, 30) * MIN);
    if (kind !== 'dine_in') history.push({ status: 'on_the_way', at: left, by: 'demo' });
    if (finalStatus === 'delivered') history.push({ status: 'delivered', at: new Date(+left + (area?.minutes || 10) * MIN + between(-2, 6) * MIN), by: 'demo' });
  }
  if (finalStatus === 'cancelled') history.push({ status: 'cancelled', at: new Date(+at + between(3, 10) * MIN), by: 'demo' });
  return {
    demo: true,
    orderId: `DEMO-${+at}${between(10, 99)}`,
    orderType: { whatsapp: 'delivery', on_call: 'phone_call', dine_in: 'dine_in' }[kind],
    timestamp: at,
    phone: kind === 'dine_in' ? 'not_provided' : who.phone,
    jid: kind === 'dine_in' ? '' : who.phone,
    profileName: kind === 'dine_in' ? 'DEMO Dine-In' : who.name,
    items: lines,
    subtotal,
    deliveryCharge: charge,
    deliveryArea: area?.name ?? null,
    deliveryMinutes: area?.minutes ?? null,
    totalAmount: subtotal + charge,
    deliveryAddress: kind === 'dine_in' ? 'Dine In' : `DEMO house ${between(1, 99)}, ${area.name}`,
    status: finalStatus,
    statusHistory: history,
    riderNotified: true, // never picked up by the n8n rider pickup message
    notes: '',
    createdAt: at,
    updatedAt: history[history.length - 1].at,
  };
}

const docs = [];
// 30 days of orders, busier on weekends
for (let d = 30; d >= 1; d--) {
  const weekday = new Date(pktDayStart(d) + 5 * 60 * MIN).getUTCDay(); // day of week in Pakistan
  const n = between(6, 11) + (weekday === 5 || weekday === 6 ? between(3, 6) : 0);
  for (let i = 0; i < n; i++) {
    const kind = weighted([['whatsapp', 55], ['on_call', 20], ['dine_in', 25]]);
    // regulars order more often
    const who = customers[Math.min(customers.length - 1, Math.floor(rand() ** 2 * customers.length))];
    docs.push(makeOrder(orderTime(d), kind, who));
  }
}
// customers who stopped ordering (last order 40 - 60 days ago)
for (const who of lapsedCustomers) {
  for (let k = 0; k < between(2, 5); k++) docs.push(makeOrder(orderTime(between(40, 60)), pick(['whatsapp', 'on_call']), who));
}
// the live board: today, still open (one of each is late)
const now = Date.now();
const live = [
  [8, 'preparing', 'whatsapp'], [47, 'preparing', 'on_call'], [25, 'on_the_way', 'whatsapp'], [55, 'on_the_way', 'whatsapp'],
];
for (const [ago, status, kind] of live) {
  const o = makeOrder(new Date(now - ago * MIN), kind, pick(customers), { status });
  if (status === 'on_the_way') o.statusHistory = [{ status: 'preparing', at: o.timestamp, by: 'demo' }, { status: 'on_the_way', at: new Date(now - (ago > 30 ? 40 : 6) * MIN), by: 'demo' }];
  else o.statusHistory = [{ status: 'preparing', at: o.timestamp, by: 'demo' }];
  docs.push(o);
}

const spendDocs = [];
const spend = (daysAgo, category, description, amount, paymentMethod = 'Cash') => {
  const at = new Date(pktDayStart(daysAgo) + between(11, 15) * 60 * MIN);
  spendDocs.push({ demo: true, timestamp: at, category, description: `DEMO ${description}`, amount, paymentMethod, createdAt: at, updatedAt: at });
};
for (let d = 30; d >= 1; d--) {
  spend(d, 'Ingredients', 'chicken, cheese, vegetables', between(6, 14) * 1000);
  if (d % 2 === 0) spend(d, 'Packaging', 'boxes and bags', between(5, 15) * 100);
  if (d % 3 === 0) spend(d, 'Gas & Electricity', 'gas cylinder', between(8, 15) * 100);
  if (d % 7 === 0) spend(d, 'Salaries', 'weekly staff wages', 35000, 'Bank');
  if (rand() < 0.15) spend(d, 'Repairs', 'small repairs', between(10, 40) * 100);
}
spend(28, 'Rent', 'monthly rent', 60000, 'Bank');

await orders.insertMany(docs);
await spends.insertMany(spendDocs);
console.log(`added ${docs.length} demo orders (${live.length} live) and ${spendDocs.length} demo spends -- remove with "npm run demo:remove"`);
await mongoose.disconnect();
