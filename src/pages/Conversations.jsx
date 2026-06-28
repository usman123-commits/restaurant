import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ChevronRight, Search, Loader2 } from 'lucide-react';

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
  return new Date(dateStr).toLocaleDateString();
}

const PAGE_SIZE = 20;

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchConversations = useCallback((offset = 0, append = false) => {
    const setter = append ? setLoadingMore : setLoading;
    setter(true);
    fetch(`/api/conversations?limit=${PAGE_SIZE}&offset=${offset}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        const list = data.conversations || [];
        setConversations((prev) => append ? [...prev, ...list] : list);
        setHasMore(data.hasMore || false);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setter(false));
  }, []);

  useEffect(() => { fetchConversations(0); }, [fetchConversations]);

  const loadMore = () => {
    fetchConversations(conversations.length, true);
  };

  const filtered = conversations.filter((conv) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (conv.profileName || '').toLowerCase().includes(q) ||
      (conv.phone || '').toLowerCase().includes(q) ||
      (conv.lastMessage || '').toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin-slow text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Conversations</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} customer{total !== 1 ? 's' : ''} -- showing {conversations.length}
          </p>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <MessageSquare size={48} className="mx-auto mb-3 opacity-40" />
          <p>{search ? 'No conversations match your search' : 'No conversations yet'}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
            {filtered.map((conv) => (
              <button
                key={conv.phone}
                onClick={() => navigate(`/conversations/${encodeURIComponent(conv.phone)}`)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-semibold text-sm shrink-0">
                  {(conv.profileName || conv.phone || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900 truncate">
                      {conv.profileName || conv.phone}
                    </p>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">
                      {timeAgo(conv.lastTimestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {conv.lastMessage || 'No messages'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {conv.messageCount > 0 && (
                    <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                      {conv.messageCount}
                    </span>
                  )}
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </button>
            ))}
          </div>

          {/* Load more */}
          {hasMore && !search && (
            <div className="flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <Loader2 size={14} className="animate-spin-slow" />
                    Loading...
                  </>
                ) : (
                  `Load more (${total - conversations.length} remaining)`
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
