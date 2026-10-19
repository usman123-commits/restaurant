import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderKind, moneySeries, spendSeries, spendsByCategory, areaStats, customerStats, liveBoard } from '../server/shared/insights.js';

const at = (s) => new Date(s);
const o = (extra) => ({ status: 'delivered', totalAmount: 1000, timestamp: at('2026-10-10T15:00:00Z'), ...extra });

test('order kind: WhatsApp, On Call, Dine In (also old dine-in orders without a type)', () => {
  assert.equal(orderKind({ orderType: 'delivery' }), 'whatsapp');
  assert.equal(orderKind({ orderType: 'phone_call' }), 'on_call');
  assert.equal(orderKind({ orderType: 'dine_in' }), 'dine_in');
  assert.equal(orderKind({ deliveryAddress: 'Dine In' }), 'dine_in');
});

test('money: revenue per kind and spends per day (Pakistan time), cancelled orders bring nothing', () => {
  const from = at('2026-10-09T19:00:00Z'); // 10 Oct 00:00 PKT
  const to = at('2026-10-11T19:00:00Z'); //   12 Oct 00:00 PKT
  const m = moneySeries(
    [
      o({ orderType: 'delivery', totalAmount: 1200 }),
      o({ orderType: 'phone_call', totalAmount: 800 }),
      o({ orderType: 'dine_in', totalAmount: 500 }),
      o({ orderType: 'delivery', status: 'cancelled', totalAmount: 9999 }),
      o({ orderType: 'delivery', totalAmount: 700, timestamp: at('2026-10-10T20:30:00Z') }), // 11 Oct 1:30 am PKT
    ],
    [{ amount: 1500, timestamp: at('2026-10-10T08:00:00Z') }],
    { from, to },
  );
  assert.equal(m.bucket, 'day');
  assert.deepEqual(m.rows.map((r) => r.key), ['2026-10-10', '2026-10-11']);
  const [d10, d11] = m.rows;
  assert.deepEqual([d10.whatsapp, d10.on_call, d10.dine_in, d10.revenue, d10.spends, d10.net], [1200, 800, 500, 2500, 1500, 1000]);
  assert.equal(d11.whatsapp, 700);
  assert.equal(m.totals.revenue, 3200);
});

test('spends by category, biggest first, with the number of entries', () => {
  assert.deepEqual(spendsByCategory([{ category: 'Gas', amount: 100 }, { category: 'Ingredients', amount: 900 }, { amount: 50 }, { category: 'Gas', amount: 300 }]), [
    { category: 'Ingredients', amount: 900, count: 1 }, { category: 'Gas', amount: 400, count: 2 }, { category: 'Other', amount: 50, count: 1 },
  ]);
});

test('spends over time: per day and per week (Monday), one-off spends flagged', () => {
  const from = at('2026-10-11T19:00:00Z'); // Mon 12 Oct 00:00 PKT
  const to = at('2026-10-20T19:00:00Z'); //   Wed 21 Oct 00:00 PKT
  const s = (day, amount, category = 'Ingredients') => ({ amount, category, timestamp: at(`2026-10-${day}T08:00:00Z`) });
  const { daily, weekly } = spendSeries(
    [s(12, 5000), s(13, 6000), s(14, 4000), s(15, 60000, 'Rent'), s(15, 5000), s(16, 5500), s(19, 7000), s(20, 3000)],
    { from, to },
  );
  assert.equal(daily.length, 9);
  assert.deepEqual(daily.map((d) => d.amount), [5000, 6000, 4000, 65000, 5500, 0, 0, 7000, 3000]);
  assert.deepEqual(daily[3].highlight, { amount: 60000, category: 'Rent' });
  assert.equal(daily[3].entries[0].category, 'Rent');
  assert.equal(daily.filter((d) => d.highlight).length, 1);
  assert.deepEqual(weekly.map((w) => [w.key, w.amount]), [['2026-10-12', 85500], ['2026-10-19', 10000]]);
});

test('areas: WhatsApp + On Call only, revenue and average order', () => {
  const a = areaStats([
    o({ orderType: 'delivery', deliveryArea: 'New Mall', totalAmount: 1050, deliveryCharge: 50 }),
    o({ orderType: 'phone_call', deliveryArea: 'New Mall', totalAmount: 950, deliveryCharge: 50 }),
    o({ orderType: 'delivery', deliveryArea: 'Parkview', totalAmount: 3000 }),
    o({ orderType: 'dine_in', totalAmount: 5000 }),
    o({ orderType: 'delivery', totalAmount: 400 }),
  ]);
  assert.deepEqual(a.map((x) => [x.area, x.orders, x.revenue]), [['Parkview', 1, 3000], ['New Mall', 2, 2000], ['Unknown / other', 1, 400]]);
  assert.equal(a[1].avgOrder, 1000);
  assert.equal(a[1].deliveryCharges, 100);
});

test('customers: new vs returning in the range, top spenders, who stopped ordering', () => {
  const from = at('2026-10-01T00:00:00Z');
  const to = at('2026-10-18T00:00:00Z');
  const now = at('2026-10-18T00:00:00Z');
  const c = customerStats(
    [
      o({ phone: '923001112201', profileName: 'Ali', timestamp: at('2026-09-20T12:00:00Z') }), // returning
      o({ phone: '923001112201', profileName: 'Ali', timestamp: at('2026-10-05T12:00:00Z'), totalAmount: 3000 }),
      o({ phone: '923001112202', profileName: 'Sara', timestamp: at('2026-10-07T12:00:00Z'), totalAmount: 500 }), // new
      o({ phone: '923001112203', profileName: 'Old', timestamp: at('2026-08-01T12:00:00Z'), totalAmount: 4000 }), // lapsed
      o({ phone: 'not_provided', orderType: 'dine_in', timestamp: at('2026-10-07T12:00:00Z') }), // not a customer
    ],
    { from, to, now },
  );
  assert.deepEqual([c.total, c.new, c.returning], [2, 1, 1]);
  assert.deepEqual(c.top.map((p) => [p.name, p.orders, p.spend]), [['Ali', 1, 3000], ['Sara', 1, 500]]);
  assert.deepEqual(c.lapsed.map((p) => [p.name, p.daysAgo]), [['Old', 77]]);
});

test('live board: open orders oldest first, minutes waiting, late ones flagged', () => {
  const now = at('2026-10-18T15:00:00Z');
  const ago = (m) => new Date(+now - m * 60000);
  const b = liveBoard(
    [
      o({ _id: 'a', orderId: 'A', status: 'preparing', timestamp: ago(10) }),
      o({ _id: 'b', orderId: 'B', status: 'preparing', timestamp: ago(50) }),
      o({ _id: 'c', orderId: 'C', status: 'on_the_way', timestamp: ago(60), deliveryMinutes: 10, statusHistory: [{ status: 'preparing', at: ago(60) }, { status: 'on_the_way', at: ago(30) }] }),
      o({ _id: 'd', orderId: 'D', status: 'delivered', timestamp: ago(90) }),
    ],
    { now },
  );
  assert.deepEqual(b.map((x) => [x.orderId, x.minutesTotal, x.minutesInStatus, x.late]), [['C', 60, 30, true], ['B', 50, 50, true], ['A', 10, 10, false]]);
});
