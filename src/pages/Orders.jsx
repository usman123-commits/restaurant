import { useState, useCallback } from 'react';
import { ShoppingBag, Clock, MapPin, Phone, ChevronDown, Search } from 'lucide-react';
import { useStaleData, invalidateCache } from '../hooks/useStaleData';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

function fmt(n) {
  if (n == null || n === '') return '0';
  const num = Number(String(n).replace(/[^0-9.\-]/g, ''));
  return isNaN(num) ? '0' : num.toLocaleString('en-PK');
}

function parseItems(items) {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return items.split(',').map(s => ({ name: s.trim() })).filter(i => i.name);
  }
}

const statusConfig = {
  preparing: { bg: 'bg-yellow-100 text-yellow-700', label: 'Preparing' },
  on_the_way: { bg: 'bg-blue-100 text-blue-700', label: 'On the Way' },
  delivered: { bg: 'bg-green-100 text-green-700', label: 'Delivered' },
  cancelled: { bg: 'bg-red-100 text-red-700', label: 'Cancelled' },
};

const ALLOWED_TRANSITIONS = {
  preparing: [
    { value: 'preparing', label: 'Preparing' },
    { value: 'on_the_way', label: 'On the Way' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  on_the_way: [
    { value: 'on_the_way', label: 'On the Way' },
    { value: 'delivered', label: 'Delivered' },
  ],
  delivered: [
    { value: 'delivered', label: 'Delivered' },
  ],
  cancelled: [
    { value: 'cancelled', label: 'Cancelled' },
  ],
};

const tabs = ['All', 'Preparing', 'On the Way', 'Delivered', 'Cancelled'];

function tabToStatus(tab) {
  return tab.toLowerCase().replace(/ /g, '_');
}

const ORDERS_URL = '/api/orders';

export default function Orders() {
  const [activeTab, setActiveTab] = useState('All');
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState('');

  const { data: rawOrders, revalidating, revalidate } = useStaleData(ORDERS_URL, {
    transform: (d) => (Array.isArray(d) ? d : []),
  });

  const orders = rawOrders ?? [];

  const updateStatus = useCallback(async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      // Invalidate cache so next revalidate returns fresh data
      invalidateCache(ORDERS_URL);
      revalidate();
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  }, [revalidate]);

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === 'All' || (o.status || 'preparing').toLowerCase() === tabToStatus(activeTab);
    if (!matchesTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (o.orderId || '').toLowerCase().includes(q) ||
      (o.profileName || '').toLowerCase().includes(q) ||
      (o.phone || '').toLowerCase().includes(q) ||
      (o.items || '').toLowerCase().includes(q) ||
      (o.deliveryAddress || '').toLowerCase().includes(q) ||
      (o.notes || '').toLowerCase().includes(q)
    );
  });

  // Only show spinner on absolute first load (no stale data yet)
  if (!rawOrders && revalidating) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          {revalidating && (
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
          )}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-brand-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 shadow-sm'
            }`}
          >
            {tab}
            {tab !== 'All' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({orders.filter((o) => (o.status || 'preparing').toLowerCase() === tabToStatus(tab)).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ShoppingBag size={48} className="mx-auto mb-3 opacity-40" />
          <p>{search ? 'No orders match your search' : 'No orders found'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((order) => {
            const items = parseItems(order.items);
            const cfg = statusConfig[(order.status || 'preparing').toLowerCase()] || statusConfig.preparing;

            return (
              <div
                key={order.orderId || order._rowIndex}
                className="bg-white rounded-xl shadow-sm p-5 animate-fade-in"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      #{order.orderId || '---'}
                    </p>
                    <p className="text-sm text-gray-500">{order.profileName || order.phone}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg}`}>
                    {cfg.label}
                  </span>
                </div>

                {/* Items */}
                <div className="border-t border-gray-100 pt-3 mb-3">
                  {items.length > 0 ? (
                    <ul className="space-y-1">
                      {items.map((item, i) => (
                        <li key={i} className="text-sm text-gray-600 flex justify-between">
                          <span>
                            {item.quantity || item.qty || 1}x {item.name || item.item || item}
                          </span>
                          {item.price != null && (
                            <span className="text-gray-400">Rs. {fmt(item.price * (item.quantity || item.qty || 1))}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic">{order.items || 'No items info'}</p>
                  )}
                </div>

                {/* Footer info */}
                <div className="border-t border-gray-100 pt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900">
                      Total: Rs. {fmt(order.totalAmount)}
                    </span>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock size={12} />
                      {timeAgo(order.timestamp)}
                    </span>
                  </div>

                  {order.phone && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <Phone size={12} />
                      {order.phone}
                    </p>
                  )}

                  {order.deliveryAddress && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <MapPin size={12} />
                      <span className="truncate">{order.deliveryAddress}</span>
                    </p>
                  )}

                  {order.notes && (
                    <p className="text-xs text-gray-500 italic mt-1">{order.notes}</p>
                  )}
                </div>

                {/* Status update */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  {(() => {
                    const currentStatus = (order.status || 'preparing').toLowerCase();
                    const availableOptions = ALLOWED_TRANSITIONS[currentStatus] || [
                      { value: currentStatus, label: statusConfig[currentStatus]?.label || currentStatus }
                    ];
                    const isFinal = currentStatus === 'delivered' || currentStatus === 'cancelled';

                    return (
                      <div className="relative">
                        <select
                          value={currentStatus}
                          onChange={(e) => updateStatus(order.orderId, e.target.value)}
                          disabled={isFinal || updatingId === order.orderId}
                          className={`w-full appearance-none rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                            isFinal
                              ? 'bg-gray-100 border border-gray-200 text-gray-500 cursor-not-allowed'
                              : 'bg-gray-50 border border-gray-200 text-gray-700 hover:bg-white cursor-pointer'
                          } disabled:opacity-75`}
                        >
                          {availableOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {!isFinal && (
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
