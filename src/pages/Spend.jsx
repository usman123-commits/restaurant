import { useState } from 'react';
import {
  DollarSign,
  Plus,
  Search,
  X,
  Clock,
  Trash2,
  Receipt,
  Wallet,
  Calendar,
  Layers,
  CreditCard,
  Building,
  Wrench,
  Users,
  PackageCheck,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useStaleData, invalidateCache } from '../hooks/useStaleData';

function fmt(n) {
  return Number(n || 0).toLocaleString();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

const CATEGORIES = [
  'All',
  'Ingredients',
  'Utilities',
  'Packaging',
  'Maintenance',
  'Staff',
  'Other',
];

const categoryConfig = {
  Ingredients: { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: PackageCheck },
  Utilities: { bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: Building },
  Packaging: { bg: 'bg-amber-100 text-amber-800 border-amber-200', icon: Layers },
  Maintenance: { bg: 'bg-purple-100 text-purple-800 border-purple-200', icon: Wrench },
  Staff: { bg: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: Users },
  Other: { bg: 'bg-gray-100 text-gray-800 border-gray-200', icon: Receipt },
};

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Other'];

const SPEND_URL = '/api/spend';

export default function Spend() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Modal form state
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Ingredients');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { data: rawSpendData, revalidating, revalidate } = useStaleData(SPEND_URL);

  const spends = rawSpendData?.spends || [];
  const totalSpend = rawSpendData?.totalSpend || 0;
  const todaySpend = rawSpendData?.todaySpend || 0;
  const monthSpend = rawSpendData?.monthSpend || 0;

  // Filter spends by category and search term
  const filtered = spends.filter((item) => {
    const matchCategory =
      activeCategory === 'All' ||
      (item.category || '').toLowerCase() === activeCategory.toLowerCase();

    if (!matchCategory) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.description || '').toLowerCase().includes(q) ||
      (item.category || '').toLowerCase().includes(q) ||
      (item.paymentMethod || '').toLowerCase().includes(q) ||
      String(item.amount || '').includes(q)
    );
  });

  const handleOpenModal = () => {
    setDescription('');
    setAmount('');
    setCategory('Ingredients');
    setPaymentMethod('Cash');
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setIsModalOpen(false);
  };

  const handleAddSpend = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please enter a description for the expense.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/spend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          description: description.trim(),
          amount: numAmount,
          category,
          paymentMethod,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        invalidateCache(SPEND_URL);
        await revalidate();
        setIsModalOpen(false);
      } else {
        setErrorMsg(data.error || 'Failed to record spend.');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    }
    setSaving(false);
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/spend/${expenseToDelete._rowIndex}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        invalidateCache(SPEND_URL);
        await revalidate();
        setExpenseToDelete(null);
      }
    } catch {
      // silent
    }
    setDeleting(false);
  };

  // Only block on first ever load
  if (!rawSpendData && revalidating) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Spent</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">Rs. {fmt(totalSpend)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-orange-50 text-brand-500 flex items-center justify-center">
              <Wallet size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">{spends.length} total transaction{spends.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today's Spend</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">Rs. {fmt(todaySpend)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Recorded since midnight</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">This Month</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">Rs. {fmt(monthSpend)}</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Calendar size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Current billing cycle</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {Object.keys(rawSpendData?.byCategory || {}).length}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Layers size={22} />
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-2">Active expense types</p>
        </div>
      </div>

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">Spend & Expenses</h2>
          {revalidating && (
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-initial">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses..."
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-full sm:w-60 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
            />
          </div>

          <button
            onClick={handleOpenModal}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0"
          >
            <Plus size={18} />
            <span>Add Spend</span>
          </button>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const count =
            cat === 'All'
              ? spends.length
              : spends.filter((s) => (s.category || '').toLowerCase() === cat.toLowerCase()).length;

          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeCategory === cat
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-100'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeCategory === cat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Spends Cards Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl shadow-sm text-gray-400">
          <Receipt size={48} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">{search ? 'No expenses match your search' : 'No expenses recorded yet'}</p>
          <p className="text-xs text-gray-400 mt-1">Click "Add Spend" above to log your first restaurant expense.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const cat = item.category || 'Other';
            const catStyle = categoryConfig[cat] || categoryConfig.Other;
            const CatIcon = catStyle.icon;

            return (
              <div
                key={item._rowIndex ?? item.timestamp}
                className="bg-white rounded-xl shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow animate-fade-in border border-gray-100"
              >
                <div>
                  {/* Top badges */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${catStyle.bg}`}
                    >
                      <CatIcon size={12} />
                      {cat}
                    </span>

                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 flex items-center gap-1">
                      <CreditCard size={11} />
                      {item.paymentMethod || 'Cash'}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="mb-2">
                    <p className="text-2xl font-black text-gray-900 tracking-tight">
                      Rs. {fmt(item.amount)}
                    </p>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-700 font-medium whitespace-pre-wrap line-clamp-3 mb-4">
                    {item.description}
                  </p>
                </div>

                {/* Footer timestamp & actions */}
                <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                  <div className="flex items-center gap-1.5" title={formatFullDate(item.timestamp)}>
                    <Clock size={13} />
                    <span>{timeAgo(item.timestamp)}</span>
                  </div>

                  <button
                    onClick={() => setExpenseToDelete(item)}
                    className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete expense"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Spend Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
                  <DollarSign size={18} />
                </div>
                <h3 className="font-bold text-lg text-gray-900">Add New Spend</h3>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={saving}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleAddSpend} className="p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg font-medium">
                  {errorMsg}
                </div>
              )}

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Amount (Rs.) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">
                    Rs.
                  </span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 3500"
                    className="w-full pl-11 pr-4 py-2.5 border border-gray-200 rounded-xl text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this expense for? (e.g. 5kg Chicken & Sauces from Metro)"
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50 resize-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-gray-50/50"
                >
                  {PAYMENT_METHODS.map((pm) => (
                    <option key={pm} value={pm}>
                      {pm}
                    </option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={saving}
                  className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin-slow" />
                      <span>Recording...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Save Expense</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {expenseToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in p-6">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>

            <h3 className="font-bold text-lg text-gray-900 text-center mb-1">
              Delete Expense?
            </h3>

            <p className="text-sm text-gray-500 text-center mb-5">
              Are you sure you want to delete the expense of{' '}
              <span className="font-bold text-gray-900">
                Rs. {fmt(expenseToDelete.amount)}
              </span>{' '}
              for <span className="italic text-gray-700 font-medium">"{expenseToDelete.description}"</span>? This will remove it permanently from your records.
            </p>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => !deleting && setExpenseToDelete(null)}
                disabled={deleting}
                className="flex-1 py-2.5 px-4 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin-slow" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
