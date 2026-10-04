// Single source of truth for the Orders page tabs.
// Imported by BOTH the API (server/routes/orders.js -> MongoDB filters) and the
// browser (src/pages/Orders.jsx -> instant re-filtering after a status change).
// Lives under server/ because Vercel only bundles server/** into the API function.
// Must stay plain JS with no Node or browser imports.
//
// A rule is one of:
//   { status: [...] }   order status is one of these ('' = missing/empty)
//   { dineIn: bool }    order is / is not dine-in (see DINE_IN_MATCHERS)
//   { all: [rules] }    every rule matches
//   { any: [rules] }    at least one rule matches

// Dine-in is inferred from text until orders carry an explicit orderType.
const DINE_IN_MATCHERS = [
  { field: 'deliveryAddress', pattern: 'dine[ -]in' },
  { field: 'phone',           pattern: 'dine' },
  { field: 'profileName',     pattern: 'dine-in' },
];

export const ORDER_TABS = [
  { name: 'All',        rule: { all: [] } },
  { name: 'Dine In',    rule: { dineIn: true } },
  { name: 'Preparing',  rule: { status: ['preparing', ''] }, active: true },
  { name: 'On the Way', rule: { status: ['on_the_way'] },    active: true },
  { name: 'Delivered',  rule: { all: [{ status: ['delivered'] }, { dineIn: false }] } },
  // "Served" is not stored: it's a dine-in order whose status is 'delivered'.
  { name: 'Served',     rule: { any: [{ status: ['served'] }, { all: [{ status: ['delivered'] }, { dineIn: true }] }] } },
  { name: 'Cancelled',  rule: { status: ['cancelled'] } },
];

export const TAB_NAMES = ORDER_TABS.map((t) => t.name);
const BY_NAME = Object.fromEntries(ORDER_TABS.map((t) => [t.name, t]));

export function getTab(name) {
  return BY_NAME[name] || BY_NAME.All;
}

// ---- Browser / JS predicate --------------------------------------------------

const DINE_IN_REGEXES = DINE_IN_MATCHERS.map((m) => ({ field: m.field, re: new RegExp(m.pattern, 'i') }));

export function isDineIn(order) {
  return DINE_IN_REGEXES.some(({ field, re }) => re.test(String(order?.[field] ?? '')));
}

function normStatus(order) {
  return String(order?.status ?? '').toLowerCase();
}

function matchRule(order, rule) {
  if (rule.all) return rule.all.every((r) => matchRule(order, r));
  if (rule.any) return rule.any.some((r) => matchRule(order, r));
  if (rule.status) return rule.status.includes(normStatus(order));
  if ('dineIn' in rule) return isDineIn(order) === rule.dineIn;
  throw new Error(`Unknown order tab rule: ${JSON.stringify(rule)}`);
}

export function matchesTab(order, tabName) {
  return matchRule(order, getTab(tabName).rule);
}

// ---- MongoDB filter ----------------------------------------------------------

const DINE_IN_MONGO = DINE_IN_MATCHERS.map((m) => ({ [m.field]: new RegExp(m.pattern, 'i') }));

function ruleToMongo(rule) {
  if (rule.all) return rule.all.length ? { $and: rule.all.map(ruleToMongo) } : {};
  if (rule.any) return { $or: rule.any.map(ruleToMongo) };
  if (rule.status) {
    // '' covers missing, null and empty, like the JS side's `status ?? ''`.
    const values = rule.status.flatMap((s) => (s === '' ? [null, ''] : [s]));
    return { status: { $in: values } };
  }
  if ('dineIn' in rule) return rule.dineIn ? { $or: DINE_IN_MONGO } : { $nor: DINE_IN_MONGO };
  throw new Error(`Unknown order tab rule: ${JSON.stringify(rule)}`);
}

export function tabMongoFilter(tabName) {
  return ruleToMongo(getTab(tabName).rule);
}
