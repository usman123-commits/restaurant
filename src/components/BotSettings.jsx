import { useEffect, useState } from 'react';
import { Banknote, MapPin, Plus, Save, Trash2, Loader2, Info } from 'lucide-react';
import { validateAreas, findArea } from '../../server/shared/deliveryAreas.js';

// WhatsApp bot settings: the payment message and the delivery areas (charge, rider time,
// other spellings). The bot reads them from botconfigs and picks up changes within 5 minutes.

const toRow = (a) => ({
  name: a.name ?? '',
  charge: a.charge ?? '',
  minutes: a.minutes ?? '',
  // the name is always matched, so only the other spellings are shown
  aliases: (a.aliases || []).filter((s) => s !== String(a.name ?? '').toLowerCase()).join(', '),
});

function SaveButton({ saving, saved, onClick, label = 'Save' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
    >
      {saving ? <Loader2 size={14} className="animate-spin-slow" /> : <Save size={14} />}
      {saving ? 'Saving...' : saved ? 'Saved!' : label}
    </button>
  );
}

function PaymentPanel({ initial, defaultText, onSaved }) {
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const save = async (value) => {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/settings/payment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text: value }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save');
      setText(data.paymentInfo);
      onSaved?.(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
          <Banknote size={20} className="text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Payment message</h3>
          <p className="text-xs text-gray-500">What the WhatsApp bot replies when a customer asks how to pay</p>
        </div>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={500}
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
        <button
          type="button"
          onClick={() => save('')}
          disabled={saving || text === defaultText}
          className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
        >
          Reset to default (cash on delivery)
        </button>
        <SaveButton saving={saving} saved={saved} onClick={() => save(text)} />
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

function AreasPanel({ initialAreas, initiallySaved, menuItems }) {
  const [rows, setRows] = useState(initialAreas.map(toRow));
  const [isSaved, setIsSaved] = useState(initiallySaved);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState([]);

  const update = (i, field, value) => setRows(rows.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  const remove = (i) => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { name: '', charge: '', minutes: '', aliases: '' }]);

  // places from the old "Delivery charges" menu category that are not in the list yet
  const missing = menuItems.filter((m) => !findArea(rows, m.name));
  const addMissing = () => setRows([...rows, ...missing.map((m) => ({ name: m.name, charge: m.charge, minutes: '', aliases: '' }))]);

  const save = async () => {
    const check = validateAreas(rows);
    if (check.errors.length) return setErrors(check.errors);
    setErrors([]);
    setSaving(true);
    try {
      const r = await fetch('/api/settings/delivery-areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ areas: rows }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not save');
      setRows(data.deliveryAreas.map(toRow));
      setIsSaved(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErrors([e.message]);
    }
    setSaving(false);
  };

  const input = 'w-full min-w-0 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
          <MapPin size={20} className="text-orange-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Delivery areas</h3>
          <p className="text-xs text-gray-500">
            Charge and rider time per area. The bot finds the area in the customer's address by its name or other spellings.
          </p>
        </div>
      </div>

      {!isSaved && (
        <div className="flex gap-2 p-3 rounded-lg bg-blue-50 text-sm text-blue-800">
          <Info size={16} className="shrink-0 mt-0.5" />
          <span>This is the bot's built-in list. Check it and press Save -- from then on the bot uses the list saved here.</span>
        </div>
      )}

      {missing.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-50 text-sm text-amber-900 space-y-2">
          <p>
            Your menu has a "Delivery charges" category with places not in this list:{' '}
            <strong>{missing.map((m) => `${m.name} (Rs. ${m.charge})`).join(', ')}</strong>. The bot does not read delivery charges
            from the menu -- add them here, fill in the rider minutes, and save.
          </p>
          <button type="button" onClick={addMissing} className="font-medium underline">
            Add {missing.length === 1 ? 'it' : 'them'} to the list
          </button>
        </div>
      )}

      {isSaved && menuItems.length > 0 && missing.length === 0 && (
        <p className="text-xs text-gray-500">
          All places from the menu's "Delivery charges" category are in this list. You can delete that category on the Menu
          page; the bot already hides it from customers.
        </p>
      )}

      <div className="hidden md:grid grid-cols-[1.2fr_0.6fr_0.6fr_2fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
        <span>Area</span>
        <span>Charge (Rs.)</span>
        <span>Rider minutes</span>
        <span>Other spellings (comma separated)</span>
        <span />
      </div>
      <div className="space-y-3 md:space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-2 md:grid-cols-[1.2fr_0.6fr_0.6fr_2fr_auto] gap-2 p-3 md:p-0 rounded-lg border md:border-0 border-gray-100"
          >
            <input className={`${input} col-span-2 md:col-span-1`} placeholder="Area, e.g. Parkview" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
            <input className={input} type="number" min="0" placeholder="Charge" value={r.charge} onChange={(e) => update(i, 'charge', e.target.value)} />
            <input className={input} type="number" min="1" placeholder="Minutes" value={r.minutes} onChange={(e) => update(i, 'minutes', e.target.value)} />
            <input className={`${input} col-span-2 md:col-span-1`} placeholder="e.g. park view, parview" value={r.aliases} onChange={(e) => update(i, 'aliases', e.target.value)} />
            <button
              type="button"
              onClick={() => remove(i)}
              title="Remove area"
              className="col-span-2 md:col-span-1 flex items-center justify-center gap-1 px-2 py-2 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 size={14} />
              <span className="md:hidden">Remove</span>
            </button>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <ul className="text-sm text-red-600 list-disc pl-5 space-y-0.5">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <Plus size={16} /> Add area
        </button>
        <SaveButton saving={saving} saved={saved} onClick={save} label="Save areas" />
      </div>
      <p className="text-xs text-gray-400">
        Rider minutes = time after the rider leaves; leave empty if unsure (the bot then promises no time). Changes reach the bot within 5 minutes.
      </p>
    </div>
  );
}

export default function BotSettings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/bot', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError('Could not load the bot settings'));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 text-sm text-gray-400 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin-slow" /> Loading bot settings...
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PaymentPanel initial={data.paymentInfo} defaultText={data.paymentDefault} />
      <AreasPanel initialAreas={data.deliveryAreas} initiallySaved={data.deliverySaved} menuItems={data.menuDeliveryItems} />
    </div>
  );
}
