import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import {
  ShoppingBag, DollarSign, TrendingUp, Target,
  ChevronRight, ArrowRight, UtensilsCrossed
} from 'lucide-react';
import {
  useInsights, DemoBanner, PeriodTiles, Tile, Segmented, RANGES, SpendsChart, MostSpends, AreasTable, CustomerLists,
} from '../components/BusinessSections';
import { useStaleData } from '../hooks/useStaleData';

import {
  DashboardSkeleton, TileSkeleton, ChartCardSkeleton, ListCardSkeleton, TableCardSkeleton,
} from '../components/Skeleton';
function fmt(n) {
  return Number(n || 0).toLocaleString('en-PK');
}

function formatDayName(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label, prefix = '', suffix = '' }) {
  if (!active || !payload?.length) return null;
  const itemData = payload[0]?.payload || {};
  const formattedDate = itemData.date
    ? new Date(itemData.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
    : label;

  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3.5 py-2.5 shadow-xl border border-gray-800">
      <p className="text-gray-400 font-medium mb-1">{formattedDate}</p>
      {payload.map((p, i) => (
        <p key={i} className="font-bold text-sm text-brand-400">
          {prefix}{fmt(p.value)}{suffix}
        </p>
      ))}
      {itemData.count != null && (
        <p className="text-[11px] text-gray-400 mt-0.5">
          {itemData.count} order{itemData.count !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [revenuePeriod, setRevenuePeriod] = useState('7d');
  const { data, revalidating } = useStaleData('/api/analytics');
  // spends, delivery areas and customers for the chosen period (7 / 30 / 90 days)
  const [days, setDays] = useState('30');
  const ins = useInsights(days);

  // Only block render if we have absolutely no data yet (very first ever load)
  if (!data && revalidating) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-gray-400">
        <TrendingUp size={48} className="mx-auto mb-3 opacity-40" />
        <p>Unable to load analytics</p>
      </div>
    );
  }

  const {
    todayOrders = 0,
    todayRevenue = 0,
    totalOrders = 0,
    avgOrderValue = 0,
    conversionRate,
    ordersByDay = [],
    topItems = [],
    ordersByHour = [],
  } = data;

  // Normalize date records to guarantee valid day and shortDate strings
  const allDays = ordersByDay.map((d) => ({
    ...d,
    day: d.day || formatDayName(d.date),
    shortDate: d.shortDate || formatShortDate(d.date),
  }));

  // 7 Days or 30 Days slice for revenue
  const revenueData = revenuePeriod === '7d' ? allDays.slice(-7) : allDays;

  // Max count for all 24 hours opacity calculations
  const maxHourCount = Math.max(...ordersByHour.map((h) => h.count || 0), 1);
  const busiestHour = ordersByHour.findIndex((h) => (h.count || 0) === maxHourCount);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pl-12 lg:pl-0">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Analytics Overview
            {(revalidating || ins.isPlaceholder) && (
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
            )}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Spends, areas and customers: last {days} days, compared with the {days} days before
          </p>
        </div>
        <Segmented options={RANGES} value={days} onChange={setDays} />
      </div>

      <DemoBanner demo={ins.data?.demo} />

      {/* All stat cards together: today, then the chosen period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Tile label="Today's Orders" value={fmt(todayOrders)} icon={ShoppingBag} tone="brand" />
        <Tile label="Today's Revenue" value={`Rs. ${fmt(todayRevenue)}`} icon={DollarSign} tone="green" />
        <Tile label="Total Orders" value={fmt(totalOrders)} icon={TrendingUp} tone="blue" foot="All time" />
        <Tile label="Avg Order Value" value={`Rs. ${fmt(avgOrderValue)}`} icon={Target} tone="purple"
          foot={conversionRate != null ? `Conversion: ${(conversionRate * 100).toFixed(1)}%` : undefined} />
        {ins.data
          ? <PeriodTiles data={ins.data} />
          : [0, 1, 2, 3].map((i) => <TileSkeleton key={i} />)}
      </div>

      {/* Revenue Chart Card (Full Width) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Revenue Trends</h3>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              {revenuePeriod === '7d' ? 'Last 7 Days Breakdown' : 'Full 30 Days Daily Breakdown'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* 7 Days vs 30 Days Toggle */}
            <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRevenuePeriod('7d')}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  revenuePeriod === '7d'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setRevenuePeriod('30d')}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  revenuePeriod === '30d'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                30 Days
              </button>
            </div>

            <Link
              to="/orders"
              className="text-xs sm:text-sm font-semibold text-brand-500 hover:text-brand-600 flex items-center gap-0.5 ml-2 transition-colors"
            >
              <span>View Details</span>
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>

        {revenueData.length > 0 ? (
          <div className="w-full h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                key={revenuePeriod}
                data={revenueData}
                margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ed7a0e" stopOpacity={0.45} />
                    <stop offset="60%" stopColor="#ed7a0e" stopOpacity={0.10} />
                    <stop offset="100%" stopColor="#ed7a0e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => (revenuePeriod === '7d' ? formatDayName(val) : formatShortDate(val))}
                  interval={revenuePeriod === '7d' ? 0 : 3}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                  dy={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
                />
                <Tooltip content={<CustomTooltip prefix="Rs. " />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ed7a0e"
                  strokeWidth={3.5}
                  fill="url(#revGrad)"
                  activeDot={{ r: 6, fill: '#ed7a0e', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-20">No revenue data available</p>
        )}
      </div>

      {/* Spends graph */}
      {ins.data ? <SpendsChart key={days} series={ins.data.spendSeries} days={days} /> : <ChartCardSkeleton title="Spends" />}

        {/* Orders by Hour of Day Card (All 24 Hours) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Orders by Hour</h3>
                <p className="text-xs text-gray-400 font-medium mt-0.5">
                  All 24 hours (12 AM - 11 PM)
                  {busiestHour >= 0 && ordersByHour[busiestHour]?.count > 0 && ` · busiest: ${ordersByHour[busiestHour].label} (${ordersByHour[busiestHour].count} orders)`}
                </p>
              </div>
            </div>

            {ordersByHour.length > 0 ? (
              <div className="w-full h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ordersByHour} margin={{ top: 30, right: 16, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hourGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ed7a0e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#ed7a0e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      interval={2}
                      tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }}
                      dy={8}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fill: '#9ca3af', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip suffix=" orders" />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#ed7a0e"
                      strokeWidth={2.5}
                      fill="url(#hourGrad)"
                      activeDot={{ r: 5, fill: '#ed7a0e', stroke: '#fff', strokeWidth: 2 }}
                      dot={({ cx, cy, index }) =>
                        index === busiestHour && maxHourCount > 0 ? (
                          <g key={index}>
                            <circle cx={cx} cy={cy} r={5} fill="#ed7a0e" stroke="#fff" strokeWidth={2} />
                            <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill="#b8480a">busiest</text>
                          </g>
                        ) : <g key={index} />
                      }
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-gray-400 text-center py-16">No hourly data available</p>
            )}
          </div>
        </div>

      {/* Lists: Top Menu Items next to Most spends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Menu Items List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Top Menu Items</h3>
                <p className="text-xs text-gray-400 font-medium mt-0.5">Most ordered dishes</p>
              </div>
            </div>

            {topItems.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {topItems.map((item, idx) => (
                  <div
                    key={item.name || idx}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group hover:bg-gray-50/60 -mx-2 px-2 rounded-xl transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Food icon badge */}
                      <div className="w-10 h-10 rounded-xl bg-orange-50 text-brand-600 border border-orange-100/70 flex items-center justify-center shrink-0 font-bold text-sm shadow-2xs">
                        <UtensilsCrossed size={17} />
                      </div>

                      {/* Title & Price */}
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate leading-snug group-hover:text-brand-600 transition-colors">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                          {item.price ? `Rs. ${fmt(item.price)}` : item.category || 'Special'}
                        </p>
                      </div>
                    </div>

                    {/* Sales Count */}
                    <div className="text-right shrink-0">
                      <p className="font-extrabold text-sm text-gray-900 tracking-tight">
                        {fmt(item.count)}
                      </p>
                      <p className="text-[11px] text-gray-400 font-medium">sales</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-gray-400">
                <UtensilsCrossed size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No sales recorded yet</p>
              </div>
            )}
          </div>

          {/* View Full Menu CTA */}
          <div className="pt-4 mt-3 border-t border-gray-100">
            <Link
              to="/menu"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-2xs"
            >
              <span>View Full Menu</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        {ins.data
          ? <MostSpends categories={ins.data.spendCategories} total={ins.data.money.totals.spends} />
          : <ListCardSkeleton title="Most spends" />}
      </div>

      {ins.data ? (
        <>
          <AreasTable areas={ins.data.areas} />
          <CustomerLists c={ins.data.customers} />
        </>
      ) : !ins.error && (
        <>
          <TableCardSkeleton title="Delivery areas" />
          <div className="grid gap-4 lg:grid-cols-2">
            <ListCardSkeleton title="Top customers" avatar="rounded-full" />
            <ListCardSkeleton title="Haven't ordered for 30+ days" avatar="rounded-full" />
          </div>
        </>
      )}
      {ins.error && <p className="text-sm text-red-600">{ins.error}</p>}
    </div>
  );
}
