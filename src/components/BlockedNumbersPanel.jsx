import { useState } from 'react';
import { Ban, X } from 'lucide-react';
import { isValidNumber } from '../../server/shared/phone.js';

// Numbers the WhatsApp bot ignores: no reply, no "typing...", not passed to the bot.
// The bridge picks up changes within a minute. Typical: the owner's number (it only messages
// the business number to keep the 24 h alert window open) and spam.
export default function BlockedNumbersPanel({ numbers, loading, onBlock, onUnblock, busy }) {
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!isValidNumber(phone)) {
      setError('Enter a valid number, e.g. 03001234567 or +92 300 1234567');
      return;
    }
    setError('');
    const ok = await onBlock({ phone, note });
    if (ok) { setPhone(''); setNote(''); }
    else setError('Could not block this number. Try again.');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 animate-fade-in space-y-4">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Ban size={16} /> Blocked numbers</h3>
        <p className="text-sm text-gray-500 mt-1">
          The bot ignores these numbers completely. Changes apply within a minute.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone, e.g. 03001234567"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. Owner"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          disabled={busy === 'add'}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {busy === 'add' ? 'Blocking...' : 'Block'}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && !numbers.length ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : numbers.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No blocked numbers</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {numbers.map((n) => (
            <li key={n.phone} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {n.phone}
                  {n.profileName && <span className="ml-2 text-gray-500 font-normal">{n.profileName}</span>}
                </p>
                {n.note && <p className="text-xs text-gray-500 truncate" title={n.note}>{n.note}</p>}
              </div>
              <button
                type="button"
                onClick={() => onUnblock(n.phone)}
                disabled={busy === n.phone}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
              >
                <X size={14} />
                {busy === n.phone ? 'Unblocking...' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

