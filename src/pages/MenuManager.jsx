import { useState, useEffect } from 'react';
import { UtensilsCrossed, Plus, X, ChevronDown, ChevronRight, Pencil, Check, Search, Trash2, Loader2 } from 'lucide-react';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-PK');
}

function Spinner({ size = 16, className = '' }) {
  return <Loader2 size={size} className={`animate-spin-slow ${className}`} />;
}

export default function MenuManager() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editData, setEditData] = useState({});
  const [newItem, setNewItem] = useState({ category: '', item: '', price: '', description: '', available: 'TRUE' });
  const [collapsed, setCollapsed] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [togglingIdx, setTogglingIdx] = useState(null);
  const [deletingIdx, setDeletingIdx] = useState(null);

  const fetchMenu = () => {
    fetch('/api/menu', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMenu(); }, []);

  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];

  const isAvail = (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toUpperCase() === 'TRUE' || val === '1' || val.toLowerCase() === 'yes';
    return Boolean(val);
  };

  const toggleAvailable = async (rowIndex, current) => {
    setTogglingIdx(rowIndex);
    setItems((prev) =>
      prev.map((it) =>
        it._rowIndex === rowIndex ? { ...it, available: current ? 'FALSE' : 'TRUE' } : it
      )
    );
    try {
      await fetch(`/api/menu/${rowIndex}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ available: current ? 'FALSE' : 'TRUE' }),
      });
      fetchMenu();
    } catch {
      setItems((prev) =>
        prev.map((it) =>
          it._rowIndex === rowIndex ? { ...it, available: current ? 'TRUE' : 'FALSE' } : it
        )
      );
    }
    setTogglingIdx(null);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await fetch(`/api/menu/${editIdx}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editData),
      });
      setEditIdx(null);
      setEditData({});
      fetchMenu();
    } catch { /* silent */ }
    setSaving(false);
  };

  const addItem = async (payload) => {
    const data = payload || newItem;
    const cat = data.category === '__new__' ? (data._newCategory || '') : data.category;
    if (!data.item || !cat) return;
    const body = { category: cat, item: data.item, price: data.price, description: data.description, available: data.available || 'TRUE' };
    setSaving(true);
    try {
      await fetch('/api/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      setNewItem({ category: '', item: '', price: '', description: '', available: 'TRUE' });
      setShowAdd(false);
      fetchMenu();
    } catch { /* silent */ }
    setSaving(false);
  };

  const deleteItem = async (rowIndex) => {
    setDeletingIdx(rowIndex);
    try {
      await fetch(`/api/menu/${rowIndex}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setDeleteConfirm(null);
      fetchMenu();
    } catch { /* silent */ }
    setDeletingIdx(null);
  };

  const toggleCategory = (cat) => {
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const searchFiltered = items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.category || '').toLowerCase().includes(q) ||
      (item.item || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.price || '').toString().includes(q)
    );
  });

  const grouped = searchFiltered.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size={32} className="text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Menu</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-52 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {showAdd ? <X size={16} /> : <Plus size={16} />}
            {showAdd ? 'Cancel' : 'Add Item'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white rounded-xl shadow-sm p-5 animate-fade-in">
          <h3 className="font-semibold text-gray-900 mb-4">New Menu Item</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none bg-white"
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="__new__">+ New category</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            {newItem.category === '__new__' && (
              <input
                placeholder="New category name"
                value={newItem._newCategory || ''}
                onChange={(e) => setNewItem({ ...newItem, _newCategory: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                autoFocus
              />
            )}
            <input
              placeholder="Item name"
              value={newItem.item}
              onChange={(e) => setNewItem({ ...newItem, item: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              placeholder="Price"
              type="number"
              value={newItem.price}
              onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              placeholder="Description (optional)"
              value={newItem.description}
              onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={() => addItem(newItem)}
            disabled={saving || !newItem.item || (!newItem.category || (newItem.category === '__new__' && !newItem._newCategory))}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Spinner size={14} className="text-white" />
                Adding...
              </>
            ) : (
              <>
                <Plus size={14} />
                Add Item
              </>
            )}
          </button>
        </div>
      )}

      {/* Menu table grouped by category */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <UtensilsCrossed size={48} className="mx-auto mb-3 opacity-40" />
          <p>{search ? 'No items match your search' : 'No menu items yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-2 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                {collapsed[category] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="font-semibold text-gray-700">{category}</span>
                <span className="text-xs text-gray-400 ml-2">({catItems.length} items)</span>
              </button>

              {!collapsed[category] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-gray-500">
                        <th className="px-5 py-2.5 font-medium">Item</th>
                        <th className="px-5 py-2.5 font-medium">Price</th>
                        <th className="px-5 py-2.5 font-medium hidden sm:table-cell">Description</th>
                        <th className="px-5 py-2.5 font-medium text-center">Available</th>
                        <th className="px-5 py-2.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {catItems.map((item) => {
                        const idx = item._rowIndex;
                        const isEditing = editIdx === idx;
                        const avail = isAvail(item.available);
                        const isToggling = togglingIdx === idx;

                        return (
                          <tr key={idx} className={`transition-colors ${isEditing ? 'bg-brand-50/30' : 'hover:bg-gray-50'}`}>
                            <td className="px-5 py-3">
                              {isEditing ? (
                                <input
                                  value={editData.item || ''}
                                  onChange={(e) => setEditData({ ...editData, item: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              ) : (
                                <span className="text-gray-900 font-medium">{item.item}</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editData.price || ''}
                                  onChange={(e) => setEditData({ ...editData, price: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              ) : (
                                <span className="text-gray-600">Rs. {fmt(item.price)}</span>
                              )}
                            </td>
                            <td className="px-5 py-3 hidden sm:table-cell">
                              {isEditing ? (
                                <input
                                  value={editData.description || ''}
                                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              ) : (
                                <span className="text-gray-500 truncate block max-w-xs">
                                  {item.description || '-'}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-center">
                              {isToggling ? (
                                <div className="flex justify-center">
                                  <Spinner size={16} className="text-brand-500" />
                                </div>
                              ) : (
                                <button
                                  onClick={() => toggleAvailable(idx, avail)}
                                  className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 ${
                                    avail ? 'bg-green-500' : 'bg-gray-300'
                                  }`}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                                      avail ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={saveEdit}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                                  >
                                    {saving ? (
                                      <>
                                        <Spinner size={12} className="text-white" />
                                        Saving...
                                      </>
                                    ) : (
                                      <>
                                        <Check size={12} />
                                        Done
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() => { setEditIdx(null); setEditData({}); }}
                                    disabled={saving}
                                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => {
                                      setEditIdx(idx);
                                      setEditData({
                                        category: item.category || '',
                                        item: item.item || '',
                                        price: item.price || '',
                                        description: item.description || '',
                                      });
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-brand-500 hover:bg-brand-50 rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil size={16} />
                                  </button>
                                  {deleteConfirm === idx ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => deleteItem(idx)}
                                        disabled={deletingIdx === idx}
                                        className="flex items-center gap-1 text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
                                      >
                                        {deletingIdx === idx ? (
                                          <Spinner size={10} className="text-white" />
                                        ) : null}
                                        Delete
                                      </button>
                                      <button
                                        onClick={() => setDeleteConfirm(null)}
                                        className="text-xs px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setDeleteConfirm(idx)}
                                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
