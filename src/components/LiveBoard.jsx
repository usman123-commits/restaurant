import { Link } from 'react-router-dom';
import { Clock, Bike, ChefHat, AlertTriangle } from 'lucide-react';
import { useStaleData } from '../hooks/useStaleData';

// Orders right now: being prepared or on the way, oldest first, with how long each has waited.
// Late (red): preparing for more than 40 minutes, or on the way longer than the area's rider time
// + 15 minutes. Refreshes every 30 seconds.
const KIND = { whatsapp: 'WhatsApp', on_call: 'On Call', dine_in: 'Dine In' };

function OrderCard({ o }) {
  const preparing = o.status === 'preparing';
  return (
    <Link
      to="/orders"
      className={`block rounded-xl border p-3 transition-colors hover:bg-gray-50 ${o.late ? 'border-red-200 bg-red-50/60' : 'border-gray-100 bg-white'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${preparing ? 'text-amber-600' : 'text-blue-600'}`}>
          {preparing ? <ChefHat size={13} /> : <Bike size={13} />} {preparing ? 'Preparing' : 'On the way'}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${o.late ? 'text-red-600' : 'text-gray-500'}`}>
          {o.late ? <AlertTriangle size={12} /> : <Clock size={12} />} {o.minutesInStatus} min
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-gray-900 truncate">
        {o.name || o.phone}
        {o.demo && <span className="ml-1.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-bold text-gray-600 align-middle">DEMO</span>}
      </p>
      <p className="text-xs text-gray-500 truncate" title={o.items}>{o.items}</p>
      <p className="mt-1 text-[11px] text-gray-400">
        {KIND[o.kind]}{o.area ? ` · ${o.area}` : ''} · Rs. {Number(o.totalAmount).toLocaleString('en-PK')} · placed {o.minutesTotal} min ago
      </p>
    </Link>
  );
}

export default function LiveBoard() {
  const { data } = useStaleData('/api/insights/live', { pollInterval: 30000 });
  const orders = data?.orders || [];
  const preparing = orders.filter((o) => o.status === 'preparing');
  const onTheWay = orders.filter((o) => o.status === 'on_the_way');
  const late = orders.filter((o) => o.late).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            Live orders
          </h3>
          <p className="text-xs text-gray-400 font-medium mt-0.5">Updates every 30 seconds</p>
        </div>
        <div className="flex gap-2 text-xs font-semibold">
          <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700">{preparing.length} preparing</span>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">{onTheWay.length} on the way</span>
          {late > 0 && <span className="rounded-lg bg-red-50 px-2.5 py-1 text-red-700">{late} late</span>}
        </div>
      </div>
      {!data ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">No open orders right now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {[['Preparing', preparing], ['On the way', onTheWay]].map(([title, list]) => (
            <div key={title} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
              {list.length ? list.map((o) => <OrderCard key={o._id} o={o} />) : <p className="text-xs text-gray-300">None</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
