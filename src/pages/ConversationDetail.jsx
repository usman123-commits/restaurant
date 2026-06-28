import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
}

const MSG_LIMIT = 50;

export default function ConversationDetail() {
  const { phone } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [total, setTotal] = useState(0);
  const [currentLimit, setCurrentLimit] = useState(MSG_LIMIT);
  const bottomRef = useRef(null);

  const fetchMessages = (limit = MSG_LIMIT, scrollToBottom = true) => {
    const setter = limit > MSG_LIMIT ? setLoadingMore : setLoading;
    setter(true);
    fetch(`/api/conversations/${encodeURIComponent(phone)}?limit=${limit}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages || []);
        setTotal(data.total || 0);
        setProfileName(data.profileName || phone);
        setCurrentLimit(limit);
        if (scrollToBottom) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      })
      .catch(() => {})
      .finally(() => setter(false));
  };

  useEffect(() => { fetchMessages(); }, [phone]);

  const loadAll = () => {
    fetchMessages(total, false);
  };

  const hasMore = total > messages.length;

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
          <h2 className="text-lg font-bold text-gray-900">{profileName}</h2>
          <p className="text-sm text-gray-500">{phone} -- {total} messages</p>
        </div>
      </div>

      {/* Chat area */}
      <div
        className="bg-white rounded-xl shadow-sm min-h-[60vh] max-h-[75vh] overflow-auto p-4"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23f3f4f6\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={32} className="animate-spin-slow text-brand-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <MessageSquare size={48} className="mx-auto mb-3 opacity-40" />
            <p>No messages in this conversation</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Load older messages */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadAll}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs text-gray-600 font-medium transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={12} className="animate-spin-slow" />
                      Loading...
                    </>
                  ) : (
                    `Load ${total - messages.length} older messages`
                  )}
                </button>
              </div>
            )}

            {messages.map((msg, i) => {
              const isOutgoing = msg.direction === 'outgoing' || msg.direction === 'out' || msg.from === 'bot';
              return (
                <div
                  key={msg.id || i}
                  className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm ${
                      isOutgoing
                        ? 'bg-green-100 text-gray-900 chat-bubble-right'
                        : 'bg-gray-100 text-gray-900 chat-bubble-left'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.body || msg.message || msg.text}</p>
                    <p className={`text-[10px] mt-1 ${isOutgoing ? 'text-green-600' : 'text-gray-400'} text-right`}>
                      {formatTime(msg.timestamp || msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
