// Thin indeterminate progress bar shown while a filter change is loading.
// The current list stays visible (dimmed) underneath instead of a full-screen spinner.
export default function LoadingBar({ active }) {
  return (
    <div className="h-0.5 w-full overflow-hidden rounded-full" aria-hidden={!active}>
      {active && <div className="h-full w-1/3 bg-brand-500 rounded-full animate-loading-bar" />}
    </div>
  );
}
