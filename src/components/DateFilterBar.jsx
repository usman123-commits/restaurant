import { Calendar, X } from 'lucide-react';

export function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

// All Dates / Today / Yesterday / pick a day. `value` is 'YYYY-MM-DD' or ''.
// Same look as the date bars on Orders and Spend.
export default function DateFilterBar({ value, onChange }) {
  const today = localDateStr();
  const yesterday = yesterdayStr();
  const btn = (active) =>
    `px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
      active ? 'bg-brand-50 text-brand-600 font-bold border border-brand-200' : 'text-gray-500 hover:text-gray-900'
    }`;

  return (
    <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-2xs border border-gray-200 shrink-0 self-start md:self-auto">
      <button type="button" onClick={() => onChange('')} className={btn(value === '')}>All Dates</button>
      <button type="button" onClick={() => onChange(today)} className={btn(value === today)}>Today</button>
      <button type="button" onClick={() => onChange(yesterday)} className={btn(value === yesterday)}>Yesterday</button>
      <div className="h-4 w-px bg-gray-200 mx-0.5" />
      <div className="flex items-center gap-1 pl-1 pr-1.5">
        <Calendar size={14} className="text-gray-400 shrink-0" />
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-xs text-gray-700 bg-transparent focus:outline-none cursor-pointer"
          title="Pick a specific date"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded hover:bg-gray-100 ml-0.5"
            title="Clear date filter"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
