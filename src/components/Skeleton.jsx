// Loading placeholders shaped like each page's real content, so the layout appears
// immediately and data fills into the same spots without the page jumping.
// Static text (page titles, headings) is rendered for real; only data is grey.

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

function PageTitle({ children, right }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <h2 className="text-2xl font-bold text-gray-900">{children}</h2>
      {right}
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border border-gray-100">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-7 w-28" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
      <Skeleton className="h-3 w-32 mt-3" />
    </div>
  );
}

function CardGridSkeleton({ count = 6, lines = 3 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-36" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="space-y-2 pt-3 border-t border-gray-100">
            {Array.from({ length: lines }, (_, j) => (
              <Skeleton key={j} className={`h-3.5 ${j % 2 ? 'w-2/3' : 'w-5/6'}`} />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

function OrderCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="mb-3 space-y-2">
        <Skeleton className="h-5 w-44" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <div className="border-t border-gray-100 py-3 flex justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-14" />
      </div>
      <div className="border-t border-gray-100 py-3 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="border-t border-gray-100 pt-3">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}

function SpendCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </div>
      <Skeleton className="h-8 w-32 mb-3" />
      <Skeleton className="h-4 w-24 mb-5" />
      <div className="pt-3 border-t border-gray-100 flex justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-4 w-4" />
      </div>
    </div>
  );
}

function GridOf({ count, Card }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => <Card key={i} />)}
    </div>
  );
}

function PillRowSkeleton({ widths }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {widths.map((w, i) => (
        <Skeleton key={i} className={`h-9 rounded-lg ${w}`} />
      ))}
    </div>
  );
}

export function OrdersSkeleton() {
  return (
    <div className="space-y-6">
      <PageTitle right={<div className="flex gap-3"><Skeleton className="h-9 w-48 sm:w-64 rounded-lg" /><Skeleton className="h-9 w-32 rounded-lg" /></div>}>
        Orders
      </PageTitle>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/40 p-1.5 rounded-2xl">
        <PillRowSkeleton widths={['w-12', 'w-24', 'w-24', 'w-28', 'w-28', 'w-24', 'w-20', 'w-24']} />
        <Skeleton className="h-10 w-80 rounded-xl" />
      </div>
      <GridOf count={6} Card={OrderCardSkeleton} />
    </div>
  );
}

export function SpendSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Spend &amp; Expenses</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-[25rem] max-w-full rounded-xl" />
          <Skeleton className="h-10 w-52 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-11 rounded-xl" />)}
      </div>
      <GridOf count={6} Card={SpendCardSkeleton} />
    </div>
  );
}

export function ConversationListSkeleton({ rows = 8 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex justify-between">
              <Skeleton className={`h-4 ${i % 3 ? 'w-32' : 'w-40'}`} />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className={`h-3.5 ${i % 2 ? 'w-3/4' : 'w-1/2'}`} />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ConversationsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">Conversations</h2>
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="h-9 w-64 rounded-lg" />
      </div>
      <ConversationListSkeleton />
    </div>
  );
}

// Chat bubbles only: the detail page keeps its real header and chat frame.
export function ChatBubblesSkeleton() {
  const bubbles = [
    { right: false, w: 'w-56', h: 'h-16' },
    { right: true, w: 'w-40', h: 'h-12' },
    { right: false, w: 'w-72', h: 'h-20' },
    { right: true, w: 'w-48', h: 'h-12' },
    { right: false, w: 'w-60', h: 'h-16' },
    { right: true, w: 'w-36', h: 'h-12' },
  ];
  return (
    <div className="space-y-3">
      {bubbles.map((b, i) => (
        <div key={i} className={`flex ${b.right ? 'justify-end' : 'justify-start'}`}>
          <Skeleton className={`${b.w} ${b.h} max-w-[75%] rounded-2xl`} />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Analytics Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-gray-900">Revenue Trends</h3>
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-8 w-36 rounded-xl" />
        </div>
        <Skeleton className="w-full h-72 sm:h-80 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {['Orders by Hour', 'Top Menu Items'].map((title) => (
          <div key={title} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-6">{title}</h3>
            <Skeleton className="w-full h-64 sm:h-72 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function HandoffCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="h-6 w-32 rounded-md mb-3" />
      <div className="border-t border-gray-100 pt-3 mb-3 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mb-3 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <Skeleton className="h-3.5 w-14" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function HandoffsSkeleton() {
  return (
    <div className="space-y-6">
      <PageTitle right={<div className="flex gap-3"><Skeleton className="h-10 w-60 rounded-xl" /><Skeleton className="h-10 w-80 rounded-xl" /></div>}>
        Handoffs
      </PageTitle>
      <div className="bg-white/40 p-1.5 rounded-2xl">
        <PillRowSkeleton widths={['w-16', 'w-48', 'w-32', 'w-32', 'w-48', 'w-28']} />
      </div>
      <GridOf count={6} Card={HandoffCardSkeleton} />
    </div>
  );
}

export function MenuSkeleton() {
  return (
    <div className="space-y-6">
      <PageTitle right={<div className="flex gap-3"><Skeleton className="h-9 w-56 rounded-lg" /><Skeleton className="h-9 w-28 rounded-lg" /></div>}>
        Menu
      </PageTitle>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-12 w-12 rounded-xl" />
      </div>
      <div className="space-y-3">
        {[5, 4, 3].map((rows, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-gray-50"><Skeleton className="h-4 w-32" /></div>
            <div className="flex items-center gap-6 px-5 py-3 border-b border-gray-100">
              {['w-12', 'w-12', 'w-24'].map((w, j) => <Skeleton key={j} className={`h-3.5 ${w}`} />)}
            </div>
            <div className="divide-y divide-gray-50">
              {Array.from({ length: rows }, (_, j) => (
                <div key={j} className="flex items-center gap-6 px-5 py-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 flex-1 hidden sm:block" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-7 w-16 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
      {[{ title: 'System Prompt', body: 'h-48' }, { title: 'Message Context', body: 'h-12' }].map((card) => (
        <div key={card.title} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">{card.title}</h3>
          <Skeleton className={`w-full ${card.body} rounded-lg`} />
        </div>
      ))}
    </div>
  );
}
