import { useState, useCallback } from 'react';
import {
  ShoppingBag,
  Clock,
  MapPin,
  Phone,
  ChevronDown,
  Search,
  Plus,
  X,
  Trash2,
  UtensilsCrossed,
  Loader2,
  Calendar,
} from 'lucide-react';
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

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getOrderDateStr(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const statusConfig = {
  preparing: { bg: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Preparing' },
  on_the_way: { bg: 'bg-blue-100 text-blue-800 border-blue-200', label: 'On the Way' },
  delivered: { bg: 'bg-green-100 text-green-800 border-green-200', label: 'Delivered' },
  served: { bg: 'bg-green-100 text-green-800 border-green-200', label: 'Served' },
  cancelled: { bg: 'bg-red-100 text-red-800 border-red-200', label: 'Cancelled' },
};

const tabs = ['All', 'Dine In', 'Preparing', 'On the Way', 'Delivered', 'Served', 'Cancelled'];

function isDineIn(order) {
  const addr = (order?.deliveryAddress || '').toLowerCase();
  const phone = (order?.phone || '').toLowerCase();
  const name = (order?.profileName || '').toLowerCase();
  return addr.includes('dine in') || addr.includes('dine-in') || phone.includes('dine') || name.includes('dine-in');
}

function isServed(order) {
  const status = (order?.status || '').toLowerCase();
  return status === 'served' || (isDineIn(order) && status === 'delivered');
}

function isDelivered(order) {
  const status = (order?.status || '').toLowerCase();
  return status === 'delivered' && !isDineIn(order);
}

function tabToStatus(tab) {
  return tab.toLowerCase().replace(/ /g, '_');
}

function matchesTabFilter(order, tab) {
  if (tab === 'All') return true;
  if (tab === 'Dine In') return isDineIn(order);
  if (tab === 'Served') return isServed(order);
  if (tab === 'Delivered') return isDelivered(order);
  if (tab === 'Preparing') return (order?.status || 'preparing').toLowerCase() === 'preparing';
  if (tab === 'On the Way') return (order?.status || '').toLowerCase() === 'on_the_way';
  if (tab === 'Cancelled') return (order?.status || '').toLowerCase() === 'cancelled';
  return (order?.status || 'preparing').toLowerCase() === tabToStatus(tab);
}

const ORDERS_URL = '/api/orders';

export default function Orders() {
  const [activeTab, setActiveTab] = useState('All');
  const [selectedDate, setSelectedDate] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState('');

  // Modal State for Manual Dine-In Order
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [profileName, setProfileName] = useState('Dine-In Customer');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [itemQty, setItemQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const { data: rawOrders, revalidating, revalidate } = useStaleData(ORDERS_URL, {
    transform: (d) => (Array.isArray(d) ? d : []),
  });

  // Fetch menu items for the item picker
  const { data: rawMenu } = useStaleData('/api/menu');
  const menuList = Array.isArray(rawMenu) ? rawMenu : [];
  const categories = ['All', ...new Set(menuList.map((m) => m.category).filter(Boolean))];

  const availableItems = selectedCategory === 'All'
    ? menuList
    : menuList.filter((m) => m.category === selectedCategory);

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

  // Handle adding an item from menu to current order
  const handleAddItemToOrder = () => {
    if (!selectedItemName) {
      setFormError('Please select an item to add.');
      return;
    }
    const menuItem = menuList.find((m) => (m.item || m.name) === selectedItemName);
    if (!menuItem) return;

    const price = parseFloat(menuItem.price) || 0;
    const qty = parseInt(itemQty, 10) || 1;

    setOrderItems((prev) => {
      const existingIndex = prev.findIndex((it) => it.name === selectedItemName);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].qty += qty;
        return updated;
      }
      return [...prev, { name: selectedItemName, price, qty }];
    });

    setSelectedItemName('');
    setItemQty(1);
    setFormError('');
  };

  const handleUpdateItemQty = (index, delta) => {
    setOrderItems((prev) => {
      const updated = [...prev];
      const newQty = updated[index].qty + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].qty = newQty;
      return updated;
    });
  };

  const handleRemoveItem = (index) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const orderTotal = orderItems.reduce((sum, it) => sum + (it.price * it.qty), 0);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      setFormError('Please add at least one item to the order.');
      return;
    }

    setSubmitting(true);
    setFormError('');

    try {
      const finalPhone = phone.trim() ? phone.trim() : 'not_provided';
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          profileName: profileName.trim() || 'Dine-In Customer',
          phone: finalPhone,
          deliveryAddress: 'Dine In',
          items: orderItems,
          totalAmount: orderTotal,
          notes: notes.trim(),
          status: 'preparing',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        invalidateCache(ORDERS_URL);
        invalidateCache('/api/analytics');
        await revalidate();
        setIsCreateModalOpen(false);
        // Reset form
        setProfileName('Dine-In Customer');
        setPhone('');
        setNotes('');
        setOrderItems([]);
        setSelectedItemName('');
        setItemQty(1);
      } else {
        setFormError(data.error || 'Failed to create order');
      }
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = orders.filter((o) => {
    // 1. Date Filter
    if (selectedDate) {
      const orderDate = getOrderDateStr(o.timestamp);
      if (orderDate !== selectedDate) return false;
    }

    // 2. Tab Filter
    if (!matchesTabFilter(o, activeTab)) return false;

    // 3. Search Filter
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
      {/* Top Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Orders</h2>
          {revalidating && (
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-48 sm:w-64 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setProfileName('Dine-In Customer');
              setPhone('');
              setNotes('');
              setOrderItems([]);
              setFormError('');
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm shrink-0"
          >
            <Plus size={18} />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Tabs and Date Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/40 p-1.5 rounded-2xl">
        {/* Status / Type Tabs */}
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-brand-500 text-white shadow-xs'
                  : 'bg-white text-gray-600 hover:bg-gray-100 shadow-2xs border border-gray-100'
              }`}
            >
              {tab}
              {tab !== 'All' && (
                <span className="ml-1.5 text-xs opacity-75">
                  ({
                    orders.filter((o) => {
                      if (selectedDate && getOrderDateStr(o.timestamp) !== selectedDate) return false;
                      return matchesTabFilter(o, tab);
                    }).length
                  })
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Date Filter Bar */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-2xs border border-gray-200 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setSelectedDate('')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedDate === ''
                ? 'bg-brand-50 text-brand-600 font-bold border border-brand-200'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            All Dates
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayStr())}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedDate === getTodayStr()
                ? 'bg-brand-50 text-brand-600 font-bold border border-brand-200'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getYesterdayStr())}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedDate === getYesterdayStr()
                ? 'bg-brand-50 text-brand-600 font-bold border border-brand-200'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Yesterday
          </button>

          <div className="h-4 w-px bg-gray-200 mx-0.5" />

          <div className="flex items-center gap-1 pl-1 pr-1.5">
            <Calendar size={14} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs text-gray-700 bg-transparent focus:outline-none cursor-pointer"
              title="Pick a specific date"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 ml-0.5"
                title="Clear date filter"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
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
            const dineIn = isDineIn(order);
            const statusLabel = dineIn
              ? ((order.status || 'preparing').toLowerCase() === 'delivered' ? 'Served' : cfg.label)
              : cfg.label;

            return (
              <div
                key={order.orderId || order._rowIndex}
                className="bg-white rounded-xl shadow-sm p-5 animate-fade-in"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        #{order.orderId || '---'}
                      </p>
                      {dineIn && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-50 text-brand-600 border border-orange-100">
                          Dine In
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{order.profileName || order.phone}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.bg}`}>
                    {statusLabel}
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

                  {/* Phone */}
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Phone size={12} />
                    <span>{order.phone && order.phone !== '' ? order.phone : 'not_provided'}</span>
                  </p>

                  {/* Location MapPin - only for delivery orders */}
                  {!dineIn && order.deliveryAddress && (
                    <p className="text-xs text-gray-400 flex items-center gap-1">
                      <MapPin size={12} />
                      <span className="truncate">{order.deliveryAddress}</span>
                    </p>
                  )}

                  {/* Table/Source details for Dine-In */}
                  {dineIn && order.deliveryAddress && order.deliveryAddress.toLowerCase() !== 'dine in' && (
                    <p className="text-xs text-brand-600 font-medium flex items-center gap-1">
                      <UtensilsCrossed size={12} />
                      <span>{order.deliveryAddress}</span>
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
                    const isFinal = currentStatus === 'delivered' || currentStatus === 'cancelled';

                    if (dineIn) {
                      // Dine-In status dropdown: No "On the Way" state
                      return (
                        <div
                          className="relative"
                          title={isFinal ? 'Order is completed and cannot be changed' : 'Update Dine-In order status'}
                        >
                          <select
                            value={currentStatus}
                            onChange={(e) => updateStatus(order.orderId, e.target.value)}
                            disabled={isFinal || updatingId === order.orderId}
                            className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors disabled:opacity-60"
                          >
                            <option
                              value="preparing"
                              disabled={currentStatus !== 'preparing'}
                              className={currentStatus !== 'preparing' ? 'text-gray-400' : 'text-gray-900'}
                            >
                              Preparing {currentStatus !== 'preparing' ? '(Cannot revert)' : ''}
                            </option>
                            <option
                              value="delivered"
                              disabled={currentStatus === 'cancelled'}
                              className={currentStatus === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}
                            >
                              Served {currentStatus === 'cancelled' ? '(Order cancelled)' : ''}
                            </option>
                            <option
                              value="cancelled"
                              disabled={currentStatus !== 'preparing' && currentStatus !== 'cancelled'}
                              className={currentStatus !== 'preparing' && currentStatus !== 'cancelled' ? 'text-gray-400' : 'text-gray-900'}
                            >
                              Cancelled {currentStatus !== 'preparing' && currentStatus !== 'cancelled' ? '(Only during preparing)' : ''}
                            </option>
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      );
                    }

                    // Standard Delivery status dropdown
                    return (
                      <div
                        className="relative"
                        title={isFinal ? 'Order is in a final state and cannot be changed' : 'Change order status'}
                      >
                        <select
                          value={currentStatus}
                          onChange={(e) => updateStatus(order.orderId, e.target.value)}
                          disabled={isFinal || updatingId === order.orderId}
                          className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors disabled:opacity-60"
                        >
                          <option
                            value="preparing"
                            disabled={currentStatus !== 'preparing'}
                            className={currentStatus !== 'preparing' ? 'text-gray-400' : 'text-gray-900'}
                          >
                            Preparing {currentStatus !== 'preparing' ? '(Cannot revert)' : ''}
                          </option>
                          <option
                            value="on_the_way"
                            disabled={currentStatus === 'delivered' || currentStatus === 'cancelled'}
                            className={currentStatus === 'delivered' || currentStatus === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}
                          >
                            On the Way {currentStatus === 'delivered' || currentStatus === 'cancelled' ? '(Cannot revert)' : ''}
                          </option>
                          <option
                            value="delivered"
                            disabled={currentStatus === 'cancelled'}
                            className={currentStatus === 'cancelled' ? 'text-gray-400' : 'text-gray-900'}
                          >
                            Delivered {currentStatus === 'cancelled' ? '(Order cancelled)' : ''}
                          </option>
                          <option
                            value="cancelled"
                            disabled={currentStatus !== 'preparing' && currentStatus !== 'cancelled'}
                            className={currentStatus !== 'preparing' && currentStatus !== 'cancelled' ? 'text-gray-400' : 'text-gray-900'}
                          >
                            Cancelled {currentStatus !== 'preparing' && currentStatus !== 'cancelled' ? '(Only during preparing)' : ''}
                          </option>
                        </select>
                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Manual Dine-In Order Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-fade-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center">
                  <UtensilsCrossed size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-gray-900 leading-tight">Create Dine-In Order</h3>
                  <p className="text-xs text-gray-400">Order ID & Timestamp will be assigned automatically</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setIsCreateModalOpen(false)}
                disabled={submitting}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateOrder} className="p-6 space-y-5">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                  {formError}
                </div>
              )}

              {/* Customer Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="e.g. Dine-In Customer or Name"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Leave blank for not_provided"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Notes / Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Less spicy, extra sauce"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                  />
                </div>
              </div>

              {/* Menu Item Picker Section */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Select Menu Items
                  </h4>
                  <span className="text-xs text-gray-400 font-medium">
                    {orderItems.length} item{orderItems.length !== 1 ? 's' : ''} added
                  </span>
                </div>

                <div className="bg-gray-50/80 p-3.5 rounded-xl border border-gray-200/80 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Category Selector */}
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        Category
                      </label>
                      <select
                        value={selectedCategory}
                        onChange={(e) => {
                          setSelectedCategory(e.target.value);
                          setSelectedItemName('');
                        }}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Item Selector */}
                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        Item
                      </label>
                      <select
                        value={selectedItemName}
                        onChange={(e) => setSelectedItemName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                      >
                        <option value="">-- Choose Item --</option>
                        {availableItems.map((item, idx) => (
                          <option key={item.item || item.name || idx} value={item.item || item.name}>
                            {item.item || item.name} (Rs. {fmt(item.price)})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Qty */}
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-semibold text-gray-500 mb-1">
                        Qty
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={itemQty}
                          onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 px-2 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddItemToOrder}
                          disabled={!selectedItemName}
                          className="flex-1 px-3 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs shrink-0"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items List Preview */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                  Order Items ({orderItems.length})
                </label>

                {orderItems.length === 0 ? (
                  <div className="text-center py-8 bg-gray-50/50 rounded-xl border border-dashed border-gray-200 text-gray-400">
                    <p className="text-xs font-medium">No items added to this order yet.</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Select a category and item above to add.</p>
                  </div>
                ) : (
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
                    {orderItems.map((item, index) => (
                      <div
                        key={index}
                        className="px-4 py-2.5 flex items-center justify-between text-xs font-medium bg-white hover:bg-gray-50/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="font-bold text-gray-900 truncate">{item.name}</p>
                          <p className="text-[11px] text-gray-400">Rs. {fmt(item.price)} each</p>
                        </div>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQty(index, -1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-200 font-bold transition-colors"
                            >
                              -
                            </button>
                            <span className="px-2.5 py-1 text-xs font-bold text-gray-900 bg-white">
                              {item.qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateItemQty(index, 1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-200 font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>

                          <span className="w-20 text-right font-bold text-gray-900">
                            Rs. {fmt(item.price * item.qty)}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(index)}
                            className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors ml-1"
                            title="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Total Summary Row */}
                    <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                        Total Amount
                      </span>
                      <span className="text-base font-extrabold text-brand-600">
                        Rs. {fmt(orderTotal)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={submitting}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || orderItems.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin-slow" />
                      <span>Creating Order...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Create Dine-In Order</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
