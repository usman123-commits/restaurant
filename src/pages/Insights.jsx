import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, BarChart,
} from 'recharts';
import { Wallet, TrendingUp, TrendingDown, Users, UserPlus, Repeat, MapPin, Info, MessageSquare } from 'lucide-react';
import StatCard from '../components/StatCard';
import { useStaleData } from '../hooks/useStaleData';

// Money (revenue by order type vs spends), delivery areas and customers, for a date range.
// Data: GET /api/insights (server/shared/insights.js).
const fmt = (n) => Number(n || 0).toLocaleString('en-PK');
const rs = (n) => `Rs. ${fmt(Math.round(n || 0))}`;
const DAY = 24 * 60 * 60 * 1000;

const SERIES = [
  { key: 'whatsapp', label: 'WhatsApp', color: '#22c55e' },
  { key: 'on_call', label: 'On Call', color: '#3b82f6' },
  { key: 'dine_in', label: 'Dine In', color: '#f59e0b' },
];
const SPEND_COLOR = '#ef4444';
const NET_COLOR = '#111827';
const PIE_COLORS = ['#ed7a0e', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#14b8a6', '#eab308', '#6b7280'];

function Card({ title, subtitle, right, children }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3.5 py-2.5 shadow-xl space-y-0.5">
      <p className="text-gray-400 font-medium mb-1">{label}</p>
      {SERIES.map((s) => <p key={s.key}><span style={{ color: s.color }}>●</span> {s.label}: {rs(r[s.key])}</p>)}
      <p className="font-bold">Revenue: {rs(r.revenue)}</p>
      <p><span style={{ color: SPEND_COLOR }}>●</span> Spends: {rs(r.spends)}</p>
      <p className={r.net >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>Revenue − Spends: {rs(r.net)}</p>
    </div>
  );
}

function MoneySection({ money, spendCategories }) {
  const [hidden, setHidden] = useState({});
  const [picked, setPicked] = useState(null);
  const t = money.totals;
  const toggle = (e) => setHidden((h) => ({ ...h, [e.dataKey]: !h[e.dataKey] }));
  const day = picked && money.rows.find((r) => r.key === picked);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Revenue" value={rs(t.revenue)} icon={TrendingUp} color="green"
          subtitle={SERIES.map((s) => `${s.label} ${t.revenue ? Math.round((t[s.key] / t.revenue) * 100) : 0}%`).join(' · ')} />
        <StatCard title="Spends" value={rs(t.spends)} icon={Wallet} color="red" />
        <StatCard title="Revenue − Spends" value={rs(t.net)} icon={t.net >= 0 ? TrendingUp : TrendingDown} color={t.net >= 0 ? 'blue' : 'red'}
          subtitle="Only the spends entered on the Spend page" />
      </div>
      <Card
        title="Revenue vs spends"
        subtitle={`Per ${money.bucket}: bars = revenue by order type, red line = spends, black line = revenue − spends. Click the legend to hide a line, a bar for that ${money.bucket}.`}
      >
        <div className="w-full h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={money.rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={(e) => { const r = e?.activePayload?.[0]?.payload || money.rows.find((x) => x.label === e?.activeLabel); if (r) setPicked(r.key); }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} minTickGap={12} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} width={40} />
              <Tooltip content={<MoneyTooltip />} cursor={{ fill: '#f8fafc' }} />
              <Legend onClick={toggle} wrapperStyle={{ fontSize: 12, cursor: 'pointer' }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="rev" fill={s.color} hide={hidden[s.key]} radius={s.key === 'dine_in' ? [4, 4, 0, 0] : 0} cursor="pointer"
                  onClick={(d) => d?.payload?.key && setPicked(d.payload.key)} />
              ))}
              <Line dataKey="spends" name="Spends" stroke={SPEND_COLOR} strokeWidth={2} dot={false} hide={hidden.spends} />
              <Line dataKey="net" name="Revenue − Spends" stroke={NET_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={false} hide={hidden.net} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {day && (
          <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-gray-900">{day.label}</p>
              <button type="button" onClick={() => setPicked(null)} className="text-xs text-gray-400 hover:text-gray-700">Close</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
              {[...SERIES.map((s) => [s.label, day[s.key]]), ['Revenue', day.revenue], ['Spends', day.spends], ['Revenue − Spends', day.net]].map(([l, v]) => (
                <div key={l}><p className="text-xs text-gray-500">{l}</p><p className={`font-bold ${l === 'Revenue − Spends' && v < 0 ? 'text-red-600' : 'text-gray-900'}`}>{rs(v)}</p></div>
              ))}
            </div>
            <Link to="/orders" className="mt-3 inline-block text-xs font-semibold text-brand-500 hover:text-brand-600">Open orders</Link>
            <Link to="/spend" className="mt-3 ml-4 inline-block text-xs font-semibold text-brand-500 hover:text-brand-600">Open spends</Link>
          </div>
        )}
      </Card>
      {spendCategories.length > 0 && (
        <Card title="Where the money goes" subtitle="Spends by category">
          <div className="grid gap-4 md:grid-cols-2 items-center">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={spendCategories} dataKey="amount" nameKey="category" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                    {spendCategories.map((c, i) => <Cell key={c.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => rs(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2 text-sm">
              {spendCategories.map((c, i) => (
                <li key={c.category} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-gray-700"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />{c.category}</span>
                  <span className="font-semibold text-gray-900">{rs(c.amount)} <span className="text-xs text-gray-400 font-normal">{t.spends ? Math.round((c.amount / t.spends) * 100) : 0}%</span></span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}

function AreasSection({ areas }) {
  return (
    <Card title="Delivery areas" subtitle="WhatsApp and On Call orders by area (dine-in has no area)">
      {areas.length === 0 ? <p className="text-sm text-gray-400">No delivery orders in this period.</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div style={{ height: Math.max(180, areas.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={areas} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="area" width={120} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v, n) => (n === 'revenue' ? rs(v) : v)} cursor={{ fill: '#f8fafc' }} />
                <Bar dataKey="revenue" name="revenue" fill="#ed7a0e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-400"><th className="pb-2 font-medium">Area</th><th className="pb-2 font-medium text-right">Orders</th><th className="pb-2 font-medium text-right">Revenue</th><th className="pb-2 font-medium text-right">Avg order</th><th className="pb-2 font-medium text-right">Delivery charges</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {areas.map((a) => (
                  <tr key={a.area}>
                    <td className="py-2 font-medium text-gray-900 flex items-center gap-1.5"><MapPin size={13} className="text-gray-400" />{a.area}</td>
                    <td className="py-2 text-right">{fmt(a.orders)}</td>
                    <td className="py-2 text-right font-semibold">{rs(a.revenue)}</td>
                    <td className="py-2 text-right">{rs(a.avgOrder)}</td>
                    <td className="py-2 text-right text-gray-500">{rs(a.deliveryCharges)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function CustomersSection({ customers: c }) {
  const split = [{ name: 'New', value: c.new, color: '#22c55e' }, { name: 'Returning', value: c.returning, color: '#3b82f6' }];
  // name on the first line, the numbers under it (fits narrow columns)
  const row = (p, main, detail) => (
    <li key={p.phone} className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{p.name || p.phone}</span>
          <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{main}</span>
        </p>
        <p className="text-xs text-gray-400 truncate">{p.phone} · {detail}</p>
      </div>
      <Link to={`/conversations/${encodeURIComponent(p.phone)}`} title="Open chat" className="shrink-0 text-gray-400 hover:text-brand-500"><MessageSquare size={15} /></Link>
    </li>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Customers who ordered" value={fmt(c.total)} icon={Users} color="purple" subtitle="WhatsApp and On Call (by phone number)" />
        <StatCard title="New customers" value={fmt(c.new)} icon={UserPlus} color="green" subtitle="First order ever in this period" />
        <StatCard title="Returning customers" value={fmt(c.returning)} icon={Repeat} color="blue" subtitle={c.total ? `${Math.round((c.returning / c.total) * 100)}% came back` : undefined} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="New vs returning">
          {c.total ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={split} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
                    {split.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm text-gray-400">No customer orders in this period.</p>}
        </Card>
        <Card title="Top customers" subtitle="Most spent in this period">
          {c.top.length ? <ul className="divide-y divide-gray-50">{c.top.map((p) => row(p, rs(p.spend), `${p.orders} order${p.orders === 1 ? '' : 's'}`))}</ul>
            : <p className="text-sm text-gray-400">No customer orders in this period.</p>}
        </Card>
        <Card title="Haven't ordered for 30+ days" subtitle="Good customers to win back">
          {c.lapsed.length ? <ul className="divide-y divide-gray-50">{c.lapsed.map((p) => row(p, `${p.daysAgo} days ago`, `${p.orders} orders · ${rs(p.spend)} in total`))}</ul>
            : <p className="text-sm text-gray-400">Nobody -- every customer ordered in the last 30 days.</p>}
        </Card>
      </div>
    </div>
  );
}

const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days']];

export default function Insights() {
  const [days, setDays] = useState('30');
  // whole minutes in the URL, so the cache key stays the same while the page is open
  const [now] = useState(() => new Date(Math.ceil(Date.now() / 60000) * 60000));
  const url = `/api/insights?from=${new Date(+now - Number(days) * DAY).toISOString()}&to=${now.toISOString()}`;
  const { data, revalidating } = useStaleData(url);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Insights</h2>
          {revalidating && <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />}
        </div>
        <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
          {RANGES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setDays(v)}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${days === v ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'}`}>{l}</button>
          ))}
        </div>
      </div>

      {data?.demo && (data.demo.orders > 0 || data.demo.spends > 0) && (
        <div className="flex gap-2 rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-900">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>This period includes <b>demo data</b> ({data.demo.orders} orders, {data.demo.spends} spends, marked DEMO). Remove it with <code className="rounded bg-amber-100 px-1">npm run demo:remove</code>.</span>
        </div>
      )}

      {!data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="h-64 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : data.error ? (
        <p className="text-sm text-red-600">{data.error}</p>
      ) : (
        <>
          <MoneySection money={data.money} spendCategories={data.spendCategories} />
          <AreasSection areas={data.areas} />
          <CustomersSection customers={data.customers} />
        </>
      )}
    </div>
  );
}
