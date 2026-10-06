import { Fragment, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Loader2, PhoneForwarded, Check, Ban } from 'lucide-react';
import { useStaleData, invalidateCache } from '../hooks/useStaleData';
import { Skeleton, ChatBubblesSkeleton } from '../components/Skeleton';
import ReportReply from '../components/ReportReply';
import { useBlockedNumbers } from '../hooks/useBlockedNumbers';
import { markReadLocally, localReadAt, dayKey, dayLabel, timeOfDay } from '../lib/chat';


// Phones with an unresolved handoff (small lookup, not the full handoff history).
const ACTIVE_HANDOFFS_URL = '/api/handoffs/active-phones';
const MSG_LIMIT = 20;

// [{ key, at, items: [{ msg, i }] }] -- consecutive messages per calendar day, in order.
// `i` is the index in the full list (used to look at the previous message).
function groupByDay(list) {
  const days = [];
  list.forEach((msg, i) => {
    const at = msg.timestamp || msg.createdAt;
    const key = dayKey(at);
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, at, items: [] });
    days[days.length - 1].items.push({ msg, i });
  });
  return days;
}
// Consecutive messages from the same side within this gap are drawn as one group
// (one name label, tighter spacing), like WhatsApp.
const GROUP_GAP_MS = 5 * 60 * 1000;

// The n8n bot logs its replies with role 'assistant' and profileName 'BOT'.
function isBotMessage(msg) {
  return msg.role === 'assistant' || msg.profileName === 'BOT';
}

// Bot (restaurant) on the left, customer on the right.
// Flip to true for the standard WhatsApp layout (own side on the right).
const BOT_ON_RIGHT = false;

export default function ConversationDetail() {
  const { phone } = useParams();
  const navigate = useNavigate();
  // Older pages loaded via "Load older" -- kept outside the SWR cache, which only
  // holds the newest page so revisits stay instant and cheap.
  const [older, setOlder] = useState({ messages: [], nextCursor: null, loaded: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const [handingOff, setHandingOff] = useState(false);
  const [handoffSuccess, setHandoffSuccess] = useState(false);
  // reports made / changed / undone on this page, by message id (null = undone)
  const [reports, setReports] = useState({});
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const prependAnchor = useRef(null);

  useEffect(() => {
    setOlder({ messages: [], nextCursor: null, loaded: false });
    setHandoffSuccess(false);
    setReports({});
  }, [phone]);

  const { data: rawData, revalidating } = useStaleData(
    `/api/conversations/${encodeURIComponent(phone)}?limit=${MSG_LIMIT}`
  );

  // SWR for active handoffs
  const { data: rawHandoffs, revalidate: revalidateHandoffs } = useStaleData(ACTIVE_HANDOFFS_URL);
  const isHandedOff = handoffSuccess || (rawHandoffs?.phones || []).includes(String(phone));
  const { isBlocked } = useBlockedNumbers();

  const total = rawData?.total ?? 0;
  const profileName = rawData?.profileName ?? phone;

  // Older pages first, then the (revalidated) newest page. Dedupe by _id because
  // the newest page slides forward as new messages arrive and can overlap.
  const seen = new Set();
  const messages = [...older.messages, ...(rawData?.messages ?? [])].filter((m) => {
    const key = m._id || `${m.timestamp}|${m.role}|${m.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const nextCursor = older.loaded ? older.nextCursor : rawData?.nextCursor ?? null;
  const hasMore = Boolean(nextCursor);

  // ---- Unread divider + mark as read ----
  // The read point as it was when this chat was opened (taken once per visit), so the
  // "N unread messages" divider stays put while we mark the chat read underneath it.
  const baseline = useRef({ phone: null, at: null });
  if (rawData && baseline.current.phone !== phone) {
    const server = new Date(rawData.lastReadAt || 0).getTime();
    baseline.current = { phone, at: Math.max(isNaN(server) ? 0 : server, localReadAt(phone)) };
  }
  const readBaseline = baseline.current.phone === phone ? baseline.current.at : null;
  const isUnread = (m) => readBaseline != null && !isBotMessage(m) && new Date(m.timestamp).getTime() > readBaseline;
  const firstUnreadId = messages.find(isUnread)?._id ?? null;
  const unreadCount = Math.max(messages.filter(isUnread).length, firstUnreadId && !older.loaded ? rawData?.unread || 0 : 0);

  // Mark read up to the newest message on screen (only moves forward).
  const newestAt = messages.length ? messages[messages.length - 1].timestamp : null;
  useEffect(() => {
    if (!newestAt || new Date(newestAt).getTime() <= localReadAt(phone)) return;
    markReadLocally(phone, newestAt);
    fetch(`/api/conversations/${encodeURIComponent(phone)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ upTo: newestAt }),
    }).catch(() => { /* next visit retries */ });
  }, [phone, newestAt]);

  // Scroll to bottom only when the newest message changes (first load / new message),
  // not when older messages are prepended.
  const lastId = messages.length ? (messages[messages.length - 1]._id || messages.length) : null;
  const unreadDividerRef = useRef(null);
  const scrolledOnce = useRef(null);
  useEffect(() => {
    if (lastId == null) return;
    // First view of this chat: jump to the unread divider if there is one (like WhatsApp).
    const first = scrolledOnce.current !== phone;
    scrolledOnce.current = phone;
    setTimeout(() => {
      if (first && unreadDividerRef.current) unreadDividerRef.current.scrollIntoView({ block: 'center' });
      else bottomRef.current?.scrollIntoView({ behavior: first ? 'auto' : 'smooth' });
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  // Keep the viewport on the same message after prepending older ones.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && prependAnchor.current != null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
    }
  }, [older.messages]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(phone)}?limit=${MSG_LIMIT}&before=${encodeURIComponent(nextCursor)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const el = scrollRef.current;
      if (el) prependAnchor.current = el.scrollHeight - el.scrollTop;
      // Snapshot what's on screen too: if a new message later pushes the oldest
      // message out of the cached newest-20 page, it must not fall into a gap.
      setOlder({
        messages: [...(data.messages || []), ...messages],
        nextCursor: data.nextCursor || null,
        loaded: true,
      });
    } catch { /* silent */ }
    setLoadingMore(false);
  };

  const handleHandoff = async () => {
    if (isHandedOff) return;
    setHandingOff(true);
    try {
      const lastMsg = messages.length > 0
        ? (messages[messages.length - 1].body || messages[messages.length - 1].message || 'none')
        : 'none';

      const res = await fetch('/api/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone,
          profileName: profileName || phone,
          reason: 'dashboard',
          description: 'Handed off manually from the dashboard',
          lastMessage: lastMsg,
        }),
      });
      const data = await res.json();
      if (data.success) {
        invalidateCache(ACTIVE_HANDOFFS_URL);
        setHandoffSuccess(true);
        revalidateHandoffs();
      }
    } catch {
      // silent
    }
    setHandingOff(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/conversations')}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {rawData ? (
              <h2 className="text-lg font-bold text-gray-900">{profileName}</h2>
            ) : (
              <Skeleton className="h-6 w-40 my-0.5" />
            )}
            {isBlocked(phone) && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100 text-[11px] font-bold"
                title="The WhatsApp bot ignores this number. Unblock under Handoffs -> Blocked numbers."
              >
                <Ban size={12} /> Blocked -- the bot does not reply to this number
              </span>
            )}
            {revalidating && (
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" title="Refreshing..." />
            )}
          </div>
          <p className="text-sm text-gray-500">{phone}{rawData ? ` -- ${total} messages` : ''}</p>
        </div>

        {/* Manual Handoff Button in Detail */}
        <button
          onClick={handleHandoff}
          disabled={isHandedOff || handingOff}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            isHandedOff
              ? 'bg-emerald-50 text-emerald-700 border-emerald-300 shadow-sm cursor-default'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 shadow-xs'
          } disabled:opacity-90`}
          title={isHandedOff ? 'Conversation is actively handed off' : 'Hand off this conversation to staff'}
        >
          {isHandedOff ? (
            <>
              <Check size={14} className="text-emerald-600 stroke-[2.5]" />
              <span>Handed Off</span>
            </>
          ) : (
            <>
              <PhoneForwarded size={14} className={handingOff ? 'animate-pulse' : ''} />
              <span>{handingOff ? 'Handing off...' : 'Hand Off'}</span>
            </>
          )}
        </button>
      </div>

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="bg-[#efeae2] rounded-xl shadow-sm min-h-[60vh] max-h-[75vh] overflow-auto p-4"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23f3f4f6\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      >
        {!rawData && revalidating ? (
          <ChatBubblesSkeleton />
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-40" />
            <p>No messages in this conversation</p>
          </div>
        ) : (
          <div>
            {/* Load older messages */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-1.5 bg-white/90 hover:bg-white shadow-sm rounded-full text-xs text-gray-600 font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={12} className="animate-spin-slow" />
                      Loading...
                    </>
                  ) : (
                    `Load older messages (${Math.max(0, total - messages.length)} more)`
                  )}
                </button>
              </div>
            )}

            {/* One section per day: the day label is sticky INSIDE its section, so it stays
                pinned while you scroll through that day and the next day's label pushes it
                out (WhatsApp style). */}
            {groupByDay(messages).map((day) => (
              <section key={day.key}>
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="px-3 py-1 rounded-lg bg-white shadow-sm text-[11px] font-medium text-gray-600">
                    {dayLabel(day.at)}
                  </span>
                </div>
                {day.items.map(({ msg, i }) => {
                  const isBot = isBotMessage(msg);
                  const onRight = isBot === BOT_ON_RIGHT;
                  const prev = messages[i - 1];
                  const at = msg.timestamp || msg.createdAt;
                  const showUnread = msg._id != null && msg._id === firstUnreadId;
                  // Same side, same day, within a few minutes, no divider in between -> same group.
                  const grouped = day.items[0].i !== i && !showUnread && prev && isBotMessage(prev) === isBot
                    && new Date(at) - new Date(prev.timestamp || prev.createdAt) < GROUP_GAP_MS;
                  return (
                    <Fragment key={msg._id || i}>
                      {showUnread && (
                        <div ref={unreadDividerRef} className="my-3 flex justify-center">
                          <span className="w-full text-center py-1 rounded-md bg-white/70 text-[11px] font-semibold text-emerald-700">
                            {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                      <div className={`flex ${onRight ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-1' : 'mt-3'}`}>
                        <div
                          className={`max-w-[75%] px-3 py-1.5 rounded-xl text-sm shadow-sm text-gray-900 ${
                            grouped ? '' : onRight ? 'chat-bubble-right' : 'chat-bubble-left'
                          } ${isBot ? 'bg-white' : 'bg-[#d9fdd3]'}`}
                        >
                          {!grouped && (
                            <p className={`text-[11px] font-semibold mb-0.5 ${isBot ? 'text-brand-600' : 'text-emerald-700'}`}>
                              {isBot ? 'OTTO (bot)' : profileName}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words leading-snug">
                            {msg.body || msg.message || msg.text}
                            {/* invisible spacer keeps the last line clear of the time */}
                            <span className="inline-block w-14" aria-hidden="true" />
                          </p>
                          <p className={`-mt-3.5 text-[10px] leading-none ${isBot ? 'text-gray-400' : 'text-emerald-700/70'} text-right`}>
                            {timeOfDay(at)}
                          </p>
                          {isBot && (
                            <ReportReply
                              message={msg}
                              report={msg._id in reports ? reports[msg._id] : msg.report || null}
                              onChange={(r) => setReports((prev) => ({ ...prev, [msg._id]: r }))}
                            />
                          )}
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </section>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
