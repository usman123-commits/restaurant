import { useState, useEffect } from 'react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { ShoppingBag, DollarSign, TrendingUp, Target } from 'lucide-react';
import StatCard from '../components/StatCard';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PK');
}

function CustomTooltip({ active, payload, label, prefix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i}>
          {prefix}{fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics', { credentials: 'include' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Analytics Overview</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Orders"
          value={fmt(todayOrders)}
          icon={ShoppingBag}
          color="brand"
        />
        <StatCard
          title="Today's Revenue"
          value={`Rs. ${fmt(todayRevenue)}`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          title="Total Orders"
          value={fmt(totalOrders)}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Avg Order Value"
          value={`Rs. ${fmt(avgOrderValue)}`}
          subtitle={conversionRate != null ? `Conversion: ${conversionRate}%` : undefined}
          icon={Target}
          color="purple"
        />
      </div>

      {/* Revenue chart */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue (Last 30 Days)</h3>
        {ordersByDay.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={ordersByDay}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ed7a0e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ed7a0e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip prefix="Rs. " />} />
              <Area type="monotone" dataKey="revenue" stroke="#ed7a0e" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-center py-10">No revenue data available</p>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top items */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Items</h3>
          {topItems.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={topItems} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} tickLine={false} width={75} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#ed7a0e" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-10">No item data available</p>
          )}
        </div>

        {/* Orders by hour */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Orders by Hour</h3>
          {ordersByHour.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={ordersByHour}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="hour" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-center py-10">No hourly data available</p>
          )}
        </div>
      </div>
    </div>
  );
}
