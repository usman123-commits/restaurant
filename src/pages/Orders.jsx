import { useState, useEffect, useCallback } from 'react';
import { ShoppingBag, Clock, MapPin, Phone, ChevronDown, Search } from 'lucide-react';

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
  return Number(n || 0).toLocaleString('en-PK');
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
  new: { bg: 'bg-red-100 text-red-700', label: 'New' },
  preparing: { bg: 'bg-yellow-100 text-yellow-700', label: 'Preparing' },
  out_for_delivery: { bg: 'bg-blue-100 text-blue-700', label: 'Out for Delivery' },
  delivered: { bg: 'bg-green-100 text-green-700', label: 'Delivered' },
};

const tabs = ['All', 'New', 'Preparing', 'Out for Delivery', 'Delivered'];

function tabToStatus(tab) {
  return tab.toLowerCase().replace(/ /g, '_');
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState('');

  const fetchOrders = useCallback(() => {
    fetch('/api/orders', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const updateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchOrders();
    } catch {
      // silent
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = orders.filter((o) => {
    const matchesTab = activeTab === 'All' || (o.status || 'new').toLowerCase() === tabToStatus(activeTab);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
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
                ({orders.filter((o) => (o.status || 'new').toLowerCase() === tabToStatus(tab)).length})
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
            const cfg = statusConfig[(order.status || 'new').toLowerCase()] || statusConfig.new;

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
                  <div className="relative">
                    <select
                      value={(order.status || 'new').toLowerCase()}
                      onChange={(e) => updateStatus(order.orderId, e.target.value)}
                      disabled={updatingId === order.orderId}
                      className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                    >
                      <option value="new">New</option>
                      <option value="preparing">Preparing</option>
                      <option value="out_for_delivery">Out for Delivery</option>
                      <option value="delivered">Delivered</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
