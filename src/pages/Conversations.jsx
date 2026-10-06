import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, ChevronRight, Search, Loader2, PhoneForwarded, Check, Ban } from 'lucide-react';
import { useStaleData, invalidateCache } from '../hooks/useStaleData';
import { useDebouncedValue, buildUrl } from '../hooks/usePagedList';
import { localReadAt } from '../lib/chat';
import { useBlockedNumbers } from '../hooks/useBlockedNumbers';

import { ConversationsSkeleton } from '../components/Skeleton';

// Phones with an unresolved handoff (small lookup, not the full handoff history).
const ACTIVE_HANDOFFS_URL = '/api/handoffs/active-phones';
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
  // Pages loaded via "Load more", tagged with the URL (= search) they belong to.
  const [extra, setExtra] = useState({ url: null, items: [] });
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [handingOffPhone, setHandingOffPhone] = useState(null);
  const [handoffSuccess, setHandoffSuccess] = useState({});
  const navigate = useNavigate();

  // Search runs on the server, so it covers every conversation, not just loaded ones.
  const debouncedSearch = useDebouncedValue(search.trim());
  const listUrl = buildUrl('/api/conversations', { limit: PAGE_SIZE, offset: 0, q: debouncedSearch });

  // SWR for the first page
  // Refreshes every 30s so new messages and unread badges show up without a reload.
  const { data: firstPage, revalidating, isPlaceholder } = useStaleData(listUrl, { pollInterval: 30000 });

  // SWR for active handoffs
  const { data: rawHandoffs, revalidate: revalidateHandoffs } = useStaleData(ACTIVE_HANDOFFS_URL);
  const activeHandoffPhones = new Set((rawHandoffs?.phones || []).map(String));
  // Blocked numbers get a visible tag, so "why isn't the bot replying?" answers itself.
  const { isBlocked } = useBlockedNumbers();

  const firstPageList = firstPage?.conversations || [];
  const total = firstPage?.total || 0;
  const hasMore = firstPage?.hasMore || false;

  // First page + extra pages. Dedupe by phone: the list is ordered by latest
  // message, so a conversation can move between pages while you browse.
  const seenPhones = new Set();
  const conversations = [...firstPageList, ...(extra.url === listUrl ? extra.items : [])].filter((c) => {
    if (seenPhones.has(c.phone)) return false;
    seenPhones.add(c.phone);
    return true;
  });

  const loadMore = async () => {
    const requestUrl = listUrl;
    setLoadingMore(true);
    try {
      const res = await fetch(requestUrl.replace('offset=0', `offset=${conversations.length}`), {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExtra((prev) => ({
        url: requestUrl,
        items: [...(prev.url === requestUrl ? prev.items : []), ...(data.conversations || [])],
      }));
    } catch { /* silent */ }
    setLoadingMore(false);
  };

  const handleHandoff = async (conv) => {
    setHandingOffPhone(conv.phone);
    try {
      const res = await fetch('/api/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: conv.phone,
          profileName: conv.profileName || conv.phone,
          reason: 'dashboard',
          description: 'Handed off manually from the dashboard',
          lastMessage: conv.lastMessage || 'none',
        }),
      });
      const data = await res.json();
      if (data.success) {
        invalidateCache(ACTIVE_HANDOFFS_URL);
        setHandoffSuccess((prev) => ({ ...prev, [conv.phone]: true }));
        revalidateHandoffs();
      }
    } catch {
      // silent
    }
    setHandingOffPhone(null);
  };

  const filtered = conversations;

  // Only block on absolute first load (no stale data yet)
  if (!firstPage && revalidating) {
    return <ConversationsSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">Conversations</h2>
            {revalidating && (
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
            )}
          </div>
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
          <div className={`bg-white rounded-xl shadow-sm divide-y divide-gray-100 transition-opacity duration-150 ${isPlaceholder ? 'opacity-50 pointer-events-none' : ''}`}>
            {filtered.map((conv) => {
              const isHandedOff = handoffSuccess[conv.phone] || activeHandoffPhones.has(String(conv.phone));
              // Read in this tab after this list was fetched? Then nothing is unread until a newer message arrives.
              const readHere = localReadAt(conv.phone) >= new Date(conv.lastTimestamp).getTime();
              const unread = readHere ? 0 : conv.unread || 0;
              return (
                <div
                  key={conv.phone}
                  onClick={() => navigate(`/conversations/${encodeURIComponent(conv.phone)}`)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors text-left cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-semibold text-sm shrink-0">
                    {(conv.profileName || conv.phone || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className={`truncate group-hover:text-brand-600 transition-colors ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-900'}`}>
                          {conv.profileName || conv.phone}
                        </p>
                        {isBlocked(conv.phone) && (
                          <span
                            className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100 text-[10px] font-bold uppercase tracking-wider"
                            title="The WhatsApp bot ignores this number. Unblock under Handoffs -> Blocked numbers."
                          >
                            <Ban size={10} /> Blocked
                          </span>
                        )}
                      </div>
                      <span className={`text-xs shrink-0 ml-2 ${unread ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                        {timeAgo(conv.lastTimestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-sm truncate ${unread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                        {conv.lastMessage || 'No messages'}
                      </p>
                      {unread > 0 && (
                        // WhatsApp-style unread badge: customer messages not seen yet
                        <span
                          className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-green-500 text-white text-[11px] font-bold flex items-center justify-center"
                          title={`${unread} unread message${unread !== 1 ? 's' : ''}`}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Manual Handoff Button / Badge */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isHandedOff) {
                          handleHandoff(conv);
                        }
                      }}
                      disabled={isHandedOff || handingOffPhone === conv.phone}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isHandedOff
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm cursor-default'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 shadow-xs'
                      } disabled:opacity-90`}
                      title={isHandedOff ? 'Conversation is actively handed off' : 'Hand off this conversation to staff'}
                    >
                      {isHandedOff ? (
                        <>
                          <Check size={13} className="text-emerald-600 stroke-[2.5]" />
                          <span>Handed Off</span>
                        </>
                      ) : (
                        <>
                          <PhoneForwarded size={13} className={handingOffPhone === conv.phone ? 'animate-pulse' : ''} />
                          <span>{handingOffPhone === conv.phone ? 'Handing off...' : 'Hand Off'}</span>
                        </>
                      )}
                    </button>

                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {hasMore && !isPlaceholder && (
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
