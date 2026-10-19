import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  Wallet, Scale, Users, UserPlus, Repeat, MapPin, MessageSquare, ArrowRight, ArrowUpRight, ArrowDownRight, Info, X, Receipt,
} from 'lucide-react';
import { useStaleData } from '../hooks/useStaleData';

// Dashboard sections for a chosen period: money (spends graph, most spends), delivery areas and
// customers. Data: GET /api/insights?from&to (server/shared/insights.js).
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const rs = (n) => `Rs. ${fmt(Math.round(n || 0))}`;
const short = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v);
const DAY = 24 * 60 * 60 * 1000;
const SPEND = '#ef4444';
const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days']];
const dateShort = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
// 923001234521 -> 0300 ••• 4521
const maskPhone = (p) => {
  const s = String(p || '').replace(/^92/, '0');
  return s.length >= 8 ? `${s.slice(0, 4)} ••• ${s.slice(-4)}` : s;
};

function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6 ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3 py-1.5 rounded-lg transition-all ${value === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

// "▲ 6%" vs the previous period. goodWhenUp: green when it went up (net), red when it went up (spends).
function Change({ now, before, goodWhenUp }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${good ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
      <Icon size={12} strokeWidth={2.5} />{Math.abs(pct)}%
    </span>
  );
}

function Tile({ label, value, icon: Icon, tone = 'gray', change, foot, valueClass = 'text-gray-900', children }) {
  const tones = { red: 'bg-red-50 text-red-600', green: 'bg-green-50 text-green-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600', gray: 'bg-gray-100 text-gray-600' };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`p-2 rounded-xl ${tones[tone]}`}><Icon size={18} /></span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <p className={`text-[28px] leading-tight font-bold tabular-nums tracking-tight ${valueClass}`}>{value}</p>
        {change}
      </div>
      {children}
      {foot && <p className="text-xs text-gray-400 mt-2">{foot}</p>}
    </div>
  );
}

// ---------- Money ----------

function SpendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3.5 py-2.5 shadow-xl max-w-[220px]">
      <p className="text-gray-400 font-medium">{r.label}</p>
      <p className="text-sm font-bold mt-0.5">{rs(r.amount)}</p>
      {r.entries[0] && <p className="text-gray-300 mt-0.5 truncate">Biggest: {r.entries[0].category} · {rs(r.entries[0].amount)}</p>}
      {r.count > 0 && <p className="text-gray-500 mt-0.5">{r.count} entr{r.count === 1 ? 'y' : 'ies'} · tap for details</p>}
    </div>
  );
}

// The one-off spends that get a text label: the biggest few, kept apart so labels never overlap.
// Other one-offs only get a dot (their numbers are in the tooltip).
function labelledKeys(rows, max = 3) {
  const gap = Math.max(2, Math.ceil(rows.length / 6));
  const picked = [];
  rows.map((r, i) => ({ r, i })).filter((x) => x.r.highlight)
    .sort((a, b) => b.r.highlight.amount - a.r.highlight.amount)
    // one label per category (weekly salaries would repeat), far enough from the others
    .forEach((x) => {
      if (picked.length < max && picked.every((p) => Math.abs(p.i - x.i) >= gap && p.r.highlight.category !== x.r.highlight.category)) picked.push(x);
    });
  return new Set(picked.map((p) => p.r.key));
}

// a dot on one-off spends (rent, salaries), with a label on the biggest ones
function HighlightDot({ cx, cy, payload, labelled, edge }) {
  if (!payload?.highlight || cx == null || cy == null) return null;
  if (!labelled?.has(payload.key)) return <circle cx={cx} cy={cy} r={3.5} fill={SPEND} stroke="#fff" strokeWidth={1.5} pointerEvents="none" />;
  const text = `${rs(payload.highlight.amount).replace('Rs. ', 'Rs ')} · ${payload.highlight.category}`;
  const w = text.length * 5.6 + 14;
  // keep the label inside the chart: near an edge it grows inward instead of centring
  const x = edge === 'start' ? cx - 10 : edge === 'end' ? cx - w + 10 : cx - w / 2;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={5} fill={SPEND} stroke="#fff" strokeWidth={2} />
      <rect x={x} y={cy - 30} width={w} height={20} rx={6} fill="#fff" stroke="#fecaca" />
      <text x={x + w / 2} y={cy - 16} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#b91c1c">{text}</text>
    </g>
  );
}

function SpendsChart({ series, days }) {
  const [view, setView] = useState(days === '7' ? 'daily' : 'weekly');
  const [picked, setPicked] = useState(null);
  const rows = series[view];
  const avg = rows.length ? rows.reduce((s, r) => s + r.amount, 0) / rows.length : 0;
  const max = Math.max(...rows.map((r) => r.amount), 0);
  const row = picked && rows.find((r) => r.key === picked);
  const labelled = labelledKeys(rows);
  const pick = (e) => {
    const r = e?.activePayload?.[0]?.payload || rows.find((x) => x.key === e?.activeLabel);
    if (r) setPicked((p) => (p === r.key ? null : r.key));
  };
  return (
    <Card
      title="Spends"
      subtitle={`${view === 'weekly' ? 'Per week' : 'Per day'} · dotted line = average ${rs(avg)} · tap a point for details`}
      right={<Segmented options={[['daily', 'Daily'], ['weekly', 'Weekly']]} value={view} onChange={(v) => { setView(v); setPicked(null); }} />}
    >
      {max === 0 ? (
        <EmptyState icon={Receipt} text="No spends entered in this period." action={<Link to="/spend" className="text-brand-600 font-semibold">Add a spend →</Link>} />
      ) : (
        <div className="h-72 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 36, right: 12, left: 0, bottom: 0 }} onClick={pick} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SPEND} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={SPEND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="key" tickFormatter={(k) => dateShort(`${k}T12:00:00Z`)} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={24} dy={6} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip content={<SpendTooltip />} cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} />
              <ReferenceLine y={avg} stroke="#94a3b8" strokeDasharray="3 4" />
              <Area type="monotone" dataKey="amount" stroke={SPEND} strokeWidth={2} fill="url(#spendFill)"
                dot={(p) => <HighlightDot key={p.index} {...p} labelled={labelled} edge={p.index < rows.length * 0.12 ? 'start' : p.index > rows.length * 0.88 ? 'end' : null} />} activeDot={{ r: 5, fill: SPEND, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {row && (
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{row.label}</p>
              <p className="text-xs text-gray-500">{rs(row.amount)} · {row.count} entr{row.count === 1 ? 'y' : 'ies'}</p>
            </div>
            <button type="button" onClick={() => setPicked(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white" title="Close"><X size={16} /></button>
          </div>
          {row.entries.length ? (
            <ul className="mt-3 divide-y divide-gray-100">
              {row.entries.map((e, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{e.category}</span>
                    {e.description && <span className="text-gray-400 truncate"> · {e.description}</span>}
                  </span>
                  <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">{rs(e.amount)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-sm text-gray-400">Nothing spent.</p>}
          {row.count > row.entries.length && <p className="text-xs text-gray-400 mt-1">+ {row.count - row.entries.length} smaller entries</p>}
          <Link to="/spend" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">Open spends <ArrowRight size={13} /></Link>
        </div>
      )}
    </Card>
  );
}

function MostSpends({ categories, total }) {
  const max = Math.max(...categories.map((c) => c.amount), 1);
  return (
    <Card title="Most spends" subtitle="By category, biggest first" className="flex flex-col">
      {categories.length ? (
        <ul className="space-y-4 flex-1">
          {categories.slice(0, 8).map((c, i) => (
            <li key={c.category} className="flex items-center gap-3">
              <span className="w-6 text-xs font-semibold text-gray-400 tabular-nums">{i + 1}</span>
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 border border-red-100/70 flex items-center justify-center shrink-0"><Wallet size={17} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.category}</p>
                  <p className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{rs(c.amount)}</p>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${(c.amount / max) * 100}%` }} />
                  </div>
                  <span className="w-20 text-right text-[11px] text-gray-400 tabular-nums">{total ? Math.round((c.amount / total) * 100) : 0}% · {c.count}×</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={Wallet} text="No spends in this period." />}
      <div className="pt-4 mt-5 border-t border-gray-100">
        <Link to="/spend" className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 hover:text-gray-900 transition-all">
          Add spend <ArrowRight size={16} />
        </Link>
      </div>
    </Card>
  );
}

// ---------- Delivery areas ----------

function AreasTable({ areas }) {
  const max = Math.max(...areas.map((a) => a.revenue), 1);
  const total = areas.reduce((t, a) => ({ orders: t.orders + a.orders, revenue: t.revenue + a.revenue, deliveryCharges: t.deliveryCharges + a.deliveryCharges }), { orders: 0, revenue: 0, deliveryCharges: 0 });
  return (
    <Card title="Delivery areas" subtitle="WhatsApp + On Call · dine-in has no area · sorted by revenue">
      {areas.length === 0 ? <EmptyState icon={MapPin} text="No delivery orders in this period." /> : (
        <div className="overflow-x-auto -mx-5 sm:mx-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                <th className="pb-3 pl-5 sm:pl-0 font-semibold">Area</th>
                <th className="pb-3 font-semibold text-right">Orders</th>
                <th className="pb-3 pl-6 font-semibold">Revenue</th>
                <th className="pb-3 font-semibold text-right">Avg order</th>
                <th className="pb-3 pr-5 sm:pr-0 font-semibold text-right">Delivery charges</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {areas.map((a) => (
                <tr key={a.area} className="hover:bg-gray-50/60">
                  <td className="py-3 pl-5 sm:pl-0">
                    <span className="flex items-center gap-2 font-medium text-gray-900"><MapPin size={14} className="text-gray-300 shrink-0" />{a.area}</span>
                  </td>
                  <td className="py-3 text-right tabular-nums text-gray-700">{fmt(a.orders)}</td>
                  <td className="py-3 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 rounded-full bg-gray-100 overflow-hidden shrink-0">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(a.revenue / max) * 100}%` }} />
                      </div>
                      <span className="font-semibold text-gray-900 tabular-nums whitespace-nowrap">{rs(a.revenue)}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right tabular-nums text-gray-700">{rs(a.avgOrder)}</td>
                  <td className="py-3 pr-5 sm:pr-0 text-right tabular-nums text-gray-500">{rs(a.deliveryCharges)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 text-gray-900 font-semibold">
                <td className="pt-3 pl-5 sm:pl-0">Total</td>
                <td className="pt-3 text-right tabular-nums">{fmt(total.orders)}</td>
                <td className="pt-3 pl-6 tabular-nums"><span className="ml-[108px]">{rs(total.revenue)}</span></td>
                <td className="pt-3 text-right tabular-nums">{rs(total.orders ? total.revenue / total.orders : 0)}</td>
                <td className="pt-3 pr-5 sm:pr-0 text-right tabular-nums">{rs(total.deliveryCharges)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Customers ----------

function PersonRow({ p, rank, right, detail }) {
  return (
    <li className="flex items-center gap-3 py-3">
      {rank != null && <span className="w-5 text-xs font-semibold text-gray-400 tabular-nums">{rank}</span>}
      <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-sm font-semibold shrink-0">
        {(p.name || '?').replace(/^DEMO\s+/, '').charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {p.name || maskPhone(p.phone)}
          {p.demo && <span className="ml-1.5 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-bold text-gray-500 align-middle">DEMO</span>}
        </p>
        <p className="text-xs text-gray-400 truncate">{maskPhone(p.phone)} · {detail}</p>
      </div>
      {right}
      <Link to={`/conversations/${encodeURIComponent(p.phone)}`} title="Open chat"
        className="shrink-0 p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-green-600 hover:border-green-200 hover:bg-green-50 transition-colors">
        <MessageSquare size={15} />
      </Link>
    </li>
  );
}

function Customers({ c }) {
  const [all, setAll] = useState(false);
  const newPct = c.total ? (c.new / c.total) * 100 : 0;
  const top = all ? c.top : c.top.slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile label="Customers who ordered" value={fmt(c.total)} icon={Users} tone="purple" foot="WhatsApp + On Call, by phone number">
          {c.total > 0 && (
            <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-green-500" style={{ width: `${newPct}%` }} />
              <div className="bg-blue-500 border-l-2 border-white" style={{ width: `${100 - newPct}%` }} />
            </div>
          )}
        </Tile>
        <Tile label="New customers" value={fmt(c.new)} icon={UserPlus} tone="green" foot="First order ever in this period" />
        <Tile label="Returning customers" value={fmt(c.returning)} icon={Repeat} tone="blue" foot={c.total ? `${Math.round((c.returning / c.total) * 100)}% came back` : 'No customer orders yet'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top customers" subtitle="Most spent in this period">
          {c.top.length ? (
            <>
              <ul className="divide-y divide-gray-50 -my-3">
                {top.map((p, i) => (
                  <PersonRow key={p.phone} p={p} rank={i + 1} detail={`${p.orders} order${p.orders === 1 ? '' : 's'}`}
                    right={<span className="text-sm font-bold text-gray-900 tabular-nums whitespace-nowrap">{rs(p.spend)}</span>} />
                ))}
              </ul>
              {c.top.length > 5 && (
                <button type="button" onClick={() => setAll((v) => !v)}
                  className="mt-4 w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                  {all ? 'Show top 5' : `Show all ${c.top.length}`}
                </button>
              )}
            </>
          ) : <EmptyState icon={Users} text="No customer orders in this period." />}
        </Card>
        <Card title="Haven't ordered for 30+ days" subtitle="Good customers to win back · send them a message">
          {c.lapsed.length ? (
            <ul className="divide-y divide-gray-50 -my-3">
              {c.lapsed.slice(0, 10).map((p) => (
                <PersonRow key={p.phone} p={p} detail={`${p.orders} orders · ${rs(p.spend)} total`}
                  right={<span className="rounded-full bg-amber-50 border border-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 whitespace-nowrap">{p.daysAgo} days</span>} />
              ))}
            </ul>
          ) : <EmptyState icon={Repeat} text="Nobody — every customer ordered in the last 30 days." />}
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text, action }) {
  return (
    <div className="py-10 text-center text-sm text-gray-400">
      <Icon size={32} className="mx-auto mb-2 opacity-30" />
      <p>{text}</p>
      {action && <p className="mt-2">{action}</p>}
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div className="pt-2">
      <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export default function BusinessSections() {
  const [days, setDays] = useState('30');
  // whole minutes in the URL, so the cache key stays the same while the page is open
  const [now] = useState(() => new Date(Math.ceil(Date.now() / 60000) * 60000));
  const from = new Date(+now - Number(days) * DAY);
  const url = `/api/insights?from=${from.toISOString()}&to=${now.toISOString()}`;
  const { data, isPlaceholder } = useStaleData(url);

  const t = data?.money?.totals;
  const prev = data?.previous;
  return (
    <div className="space-y-6">
      {/* period header */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-4 border-t border-gray-200/70">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Money &amp; customers
            {isPlaceholder && <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Loading..." />}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Last {days} days · {dateShort(from)} – {dateShort(now)} · changes compare with the {days} days before
          </p>
        </div>
        <Segmented options={RANGES} value={days} onChange={setDays} />
      </div>

      {data?.demo && (data.demo.orders > 0 || data.demo.spends > 0) && (
        <div className="flex gap-2.5 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>This period includes <b>demo data</b> ({data.demo.orders} orders, {data.demo.spends} spends, marked DEMO). Remove it with <code className="rounded bg-amber-100 px-1 text-xs">npm run demo:remove</code>.</span>
        </div>
      )}

      {!data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-56 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : data.error ? (
        <p className="text-sm text-red-600">{data.error}</p>
      ) : (
        <div className={`space-y-6 transition-opacity ${isPlaceholder ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Tile label="Total spends" value={rs(t.spends)} icon={Wallet} tone="red"
              change={<Change now={t.spends} before={prev?.spends} goodWhenUp={false} />}
              foot={`${data.spendCategories.reduce((s, c) => s + c.count, 0)} entries on the Spend page`} />
            <Tile label="Revenue − Spends" value={rs(t.net)} icon={Scale} tone={t.net >= 0 ? 'green' : 'red'}
              valueClass={t.net >= 0 ? 'text-gray-900' : 'text-red-600'}
              change={<Change now={t.net} before={prev?.net} goodWhenUp />}
              foot={`${rs(t.revenue)} revenue − ${rs(t.spends)} spends · only spends entered on the Spend page`} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 min-w-0"><SpendsChart key={days} series={data.spendSeries} days={days} /></div>
            <MostSpends categories={data.spendCategories} total={t.spends} />
          </div>

          <AreasTable areas={data.areas} />

          <SectionTitle title="Customers" subtitle="Counted by phone number · WhatsApp + On Call" />
          <Customers c={data.customers} />
        </div>
      )}
    </div>
  );
}
