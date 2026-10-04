import { useState } from 'react';
import { PhoneForwarded, CheckCircle, Ban } from 'lucide-react';
import { invalidateCache, useStaleData } from '../hooks/useStaleData';
import { usePagedList, usePrefetchInto, localDayRange, buildUrl } from '../hooks/usePagedList';
import LoadMoreButton from '../components/LoadMoreButton';
import LoadingBar from '../components/LoadingBar';
import DateFilterBar, { localDateStr } from '../components/DateFilterBar';
import { HandoffsSkeleton } from '../components/Skeleton';
import { HANDOFF_REASONS, OTHER_REASON, reasonLabel } from '../../server/shared/handoffReasons.js';
import { normalizeNumber } from '../../server/shared/phone.js';
import BlockedNumbersPanel from '../components/BlockedNumbersPanel';

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

const HANDOFFS_URL = '/api/handoffs';
const ACTIVE_HANDOFFS_URL = '/api/handoffs/active-phones';
const BLOCKED_URL = '/api/blocked';
const PAGE_SIZE = 20;
const LIVE_REFRESH_MS = 30000;

const REASON_TABS = [{ key: 'All', label: 'All' }, ...HANDOFF_REASONS, OTHER_REASON];
const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const REASON_STYLE = {
  dashboard:     'bg-gray-100 text-gray-700 border-gray-200',
  cancellation:  'bg-red-50 text-red-700 border-red-100',
  modification:  'bg-blue-50 text-blue-700 border-blue-100',
  talk_to_staff: 'bg-purple-50 text-purple-700 border-purple-100',
  complaint:     'bg-orange-50 text-orange-700 border-orange-100',
  other:         'bg-gray-50 text-gray-500 border-gray-200',
};

export default function Handoffs() {
  // Default to the work queue: unresolved handoffs.
  const [status, setStatus] = useState('active');
  const [reason, setReason] = useState('All');
  const [selectedDate, setSelectedDate] = useState('');
  const [resolving, setResolving] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);
  // 'add' while the panel's form blocks a number; the phone while that row / card is busy
  const [blockBusy, setBlockBusy] = useState(null);

  // Numbers the bot ignores (owner's number, spam). The WhatsApp bridge reads the same list.
  const { data: blockedData, revalidating: blockedLoading, revalidate: revalidateBlocked } = useStaleData(BLOCKED_URL);
  const blockedNumbers = blockedData?.numbers || [];
  const blockedSet = new Set(blockedNumbers.map((n) => n.phone));
  const isBlocked = (phone) => blockedSet.has(normalizeNumber(phone));

  const block = async ({ phone, profileName = '', note = '' }, busyKey) => {
    setBlockBusy(busyKey);
    let ok = false;
    try {
      const res = await fetch(BLOCKED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone, profileName, note }),
      });
      ok = res.ok;
      await revalidateBlocked();
    } catch { /* silent */ }
    setBlockBusy(null);
    return ok;
  };

  const unblock = async (phone) => {
    setBlockBusy(phone);
    try {
      await fetch(`${BLOCKED_URL}/${encodeURIComponent(phone)}`, { method: 'DELETE', credentials: 'include' });
      await revalidateBlocked();
    } catch { /* silent */ }
    setBlockBusy(null);
  };

  // Every filter is part of the URL (= cache key); the server filters and paginates.
  const range = localDayRange(selectedDate);
  const filterParams = { status, from: range?.from, to: range?.to, limit: PAGE_SIZE };
  // Param order matters: this string is the cache key, shared with the prefetch below.
  const urlForReason = (r) => buildUrl(HANDOFFS_URL, { reason: r, ...filterParams });
  const listUrl = urlForReason(reason);

  // First page of every reason tab in one request, so switching tabs is instant.
  usePrefetchInto(buildUrl(`${HANDOFFS_URL}/tabs`, filterParams), urlForReason);

  const {
    data,
    items: handoffs,
    hasMore,
    loadMore,
    loadingMore,
    revalidating,
    isPlaceholder,
    revalidate,
    mutateItems,
  } = usePagedList(listUrl, 'handoffs', {
    // New handoffs can arrive any time; resolved history and past days only on open.
    pollInterval: status !== 'resolved' && (!selectedDate || selectedDate === localDateStr()) ? LIVE_REFRESH_MS : 0,
  });
  const reasonCounts = data?.reasonCounts || {};
  const statusCounts = data?.statusCounts || {};

  const resolve = async (id) => {
    setResolving(id);
    try {
      const res = await fetch(`/api/handoffs/${id}/resolve`, { method: 'PATCH', credentials: 'include' });
      if (res.ok) {
        // Rows from "Load more" pages live outside the cache -- patch them locally.
        mutateItems((items) => items.map((h) => (h._id === id ? { ...h, status: 'resolved' } : h)));
        invalidateCache(ACTIVE_HANDOFFS_URL);
      }
      await revalidate();
    } catch { /* silent */ }
    setResolving(null);
  };

  // Only on the very first load (nothing to show yet).
  if (!data && revalidating) {
    return <HandoffsSkeleton />;
  }

  // A just-resolved card leaves the Active view at once, without waiting for the refetch.
  const visible = isPlaceholder || status !== 'active'
    ? handoffs
    : handoffs.filter((h) => h.status !== 'resolved');
  const tabs = REASON_TABS.filter((t) => t.key !== OTHER_REASON.key || reasonCounts[OTHER_REASON.key] > 0 || reason === OTHER_REASON.key);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-900">Handoffs</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center bg-white p-1 rounded-xl shadow-2xs border border-gray-200 text-xs font-semibold">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  status === t.key ? 'bg-brand-50 text-brand-600 font-bold border border-brand-200' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t.label}
                <span className="ml-1 opacity-75">({statusCounts[t.key] ?? 0})</span>
              </button>
            ))}
          </div>
          <DateFilterBar value={selectedDate} onChange={setSelectedDate} />
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border shadow-2xs transition-colors ${
              showBlocked ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-gray-600 border-gray-200 hover:text-gray-900'
            }`}
          >
            <Ban size={14} />
            Blocked numbers ({blockedNumbers.length})
          </button>
        </div>
      </div>

      {showBlocked && (
        <BlockedNumbersPanel
          numbers={blockedNumbers}
          loading={blockedLoading}
          busy={blockBusy}
          onBlock={(n) => block(n, 'add')}
          onUnblock={unblock}
        />
      )}

      {/* Reason tabs */}
      <div className="flex gap-2 flex-wrap bg-white/40 p-1.5 rounded-2xl">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setReason(t.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              reason === t.key
                ? 'bg-brand-500 text-white shadow-xs'
                : 'bg-white text-gray-600 hover:bg-gray-100 shadow-2xs border border-gray-100'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-75">({reasonCounts[t.key] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Cards -- dimmed with a loading bar while a new filter loads */}
      <div className="relative">
        <div className="absolute -top-3 inset-x-0"><LoadingBar active={isPlaceholder} /></div>
        <div className={`space-y-6 transition-opacity duration-150 ${isPlaceholder ? 'opacity-50 pointer-events-none' : ''}`}>
          {visible.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <PhoneForwarded size={48} className="mx-auto mb-3 opacity-40" />
              <p>No handoffs match these filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visible.map((h) => {
                const isActive = h.status !== 'resolved';
                const reasonKey = REASON_STYLE[h.reason] ? h.reason : 'other';
                return (
                  // Same sections in the same order on every card, fixed-height text blocks
                  // and the footer pinned to the bottom, so cards line up across a row.
                  <div
                    key={h._id}
                    className={`bg-white rounded-xl shadow-sm p-5 animate-fade-in flex flex-col h-full ${
                      isActive ? 'ring-2 ring-brand-200' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{h.profileName || h.phone}</p>
                        <p className="text-sm text-gray-500">{h.phone}</p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                          isActive ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {isActive ? 'Active' : 'Resolved'}
                      </span>
                    </div>

                    <div className="mb-3">
                      <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${REASON_STYLE[reasonKey]}`}>
                        {reasonLabel(h.reason)}
                      </span>
                    </div>

                    <div className="border-t border-gray-100 pt-3 mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                      <p className="text-sm text-gray-700 line-clamp-2 min-h-[2.5rem]" title={h.description || ''}>
                        {h.description || <span className="text-gray-400 italic">No description</span>}
                      </p>
                    </div>

                    <div className="mb-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Last Message</p>
                      <p className="text-sm text-gray-600 line-clamp-2 min-h-[2.5rem]" title={h.lastMessage || ''}>
                        {h.lastMessage && h.lastMessage !== 'none'
                          ? h.lastMessage
                          : <span className="text-gray-400 italic">No message</span>}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100 min-h-[2.75rem]">
                      <span className="text-xs text-gray-400">{timeAgo(h.timestamp || h.createdAt)}</span>
                      <div className="flex items-center gap-2">
                      {isBlocked(h.phone) ? (
                        <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg">
                          <Ban size={14} /> Blocked
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="The bot will ignore this number"
                          onClick={() => block({ phone: h.phone, profileName: h.profileName || '', note: `Blocked from a ${reasonLabel(h.reason).toLowerCase()} handoff` }, h.phone)}
                          disabled={blockBusy === h.phone}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Ban size={14} />
                          {blockBusy === h.phone ? 'Blocking...' : 'Block'}
                        </button>
                      )}
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => resolve(h._id)}
                          disabled={resolving === h._id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={14} />
                          {resolving === h._id ? 'Resolving...' : 'Resolve'}
                        </button>
                      )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && (
            <LoadMoreButton
              onClick={loadMore}
              loading={loadingMore}
              label={`Load more (${Math.max(0, (reasonCounts[reason] ?? 0) - handoffs.length)} remaining)`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
