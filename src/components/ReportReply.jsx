import { useState } from 'react';
import { Flag, Loader2 } from 'lucide-react';

// "Report wrong reply" under a bot message. The report (with the bot's full trace) is reviewed
// in the Zelvop console and becomes a fix and a test for the bot, so it does not happen again.
export default function ReportReply({ message, report, onChange }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(report?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ conversationId: message._id, note }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not send');
      onChange({ note: data.report.note });
      setOpen(false);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const undo = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`/api/feedback/${message._id}`, { method: 'DELETE', credentials: 'include' });
      // Only clear the "Reported" tag once the server confirms; otherwise the report would
      // still be saved (and reviewed) while the screen says it's gone.
      if (!r.ok) throw new Error('not removed');
      onChange(null);
      setNote('');
    } catch {
      setError("Couldn't undo the report. Try again.");
    }
    setBusy(false);
  };

  if (!message._id) return null;

  if (open) {
    return (
      <div className="mt-2 border-t border-gray-100 pt-2 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          placeholder="What was wrong? What should the bot have said?"
          className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-500 hover:bg-red-600 text-white text-xs font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin-slow" /> : <Flag size={12} />}
            {report ? 'Update report' : 'Report'}
          </button>
        </div>
      </div>
    );
  }

  if (report) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-600">
          <Flag size={10} /> Reported
        </span>
        {report.note && <span className="text-gray-500 line-clamp-2" title={report.note}>{report.note}</span>}
        <button type="button" onClick={() => setOpen(true)} className="text-gray-400 hover:text-gray-700">Edit</button>
        <button type="button" onClick={undo} disabled={busy} className="text-gray-400 hover:text-gray-700">
          {busy ? 'Undoing...' : 'Undo'}
        </button>
        {error && <span className="w-full text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600"
      title="Report this reply as wrong"
    >
      <Flag size={11} /> Report wrong reply
    </button>
  );
}
