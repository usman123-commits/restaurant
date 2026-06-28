import { useState, useEffect } from 'react';
import { PhoneForwarded, CheckCircle } from 'lucide-react';

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
  return `${days}d ago`;
}

export default function Handoffs() {
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  const fetchHandoffs = () => {
    fetch('/api/handoffs', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setHandoffs(Array.isArray(data) ? data : data.handoffs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchHandoffs(); }, []);

  const resolve = async (phone) => {
    setResolving(phone);
    try {
      await fetch(`/api/handoffs/${encodeURIComponent(phone)}/resolve`, { method: 'PATCH', credentials: 'include' });
      fetchHandoffs();
    } catch { /* silent */ }
    setResolving(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Handoffs</h2>
        <div className="text-center py-20 text-gray-400">
          <PhoneForwarded size={48} className="mx-auto mb-3 opacity-40" />
          <p>No handoffs at the moment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Handoffs</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {handoffs.map((h) => {
          const isActive = h.status === 'active' || h.status === 'pending' || !h.resolvedAt;
          return (
            <div
              key={h.phone || h.id}
              className={`bg-white rounded-xl shadow-sm p-5 animate-fade-in ${
                isActive ? 'ring-2 ring-brand-200' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-gray-900">
                    {h.profileName || h.name || h.phone}
                  </p>
                  <p className="text-sm text-gray-500">{h.phone}</p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    isActive
                      ? 'bg-red-100 text-red-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {isActive ? 'Active' : 'Resolved'}
                </span>
              </div>

              {h.reason && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Reason</p>
                  <p className="text-sm text-gray-700">{h.reason}</p>
                </div>
              )}

              {h.lastMessage && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Last Message</p>
                  <p className="text-sm text-gray-600 line-clamp-2">{h.lastMessage}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">
                  {timeAgo(h.timestamp || h.createdAt)}
                </span>
                {isActive && (
                  <button
                    onClick={() => resolve(h.phone)}
                    disabled={resolving === h.phone}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <CheckCircle size={14} />
                    {resolving === h.phone ? 'Resolving...' : 'Resolve'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
