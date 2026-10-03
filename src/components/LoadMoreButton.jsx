import { Loader2 } from 'lucide-react';

export default function LoadMoreButton({ onClick, loading, label = 'Load more' }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 size={14} className="animate-spin-slow" />
            Loading...
          </>
        ) : (
          label
        )}
      </button>
    </div>
  );
}
