import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';
import MenuManager from './pages/MenuManager';
import Handoffs from './pages/Handoffs';
import Spend from './pages/Spend';
import Settings from './pages/Settings';

// "This browser was logged in last time." Lets a reload draw the app (sidebar +
// page skeletons) immediately while /api/auth/check runs in parallel with the
// page's data requests, instead of a blank screen waiting on the check first.
// It is only a UI hint: no data is shown until the API (which checks the real,
// httpOnly session cookie on every request) answers.
const LOGGED_IN_HINT = 'otto.dashboard.loggedIn';

function readHint() {
  try { return localStorage.getItem(LOGGED_IN_HINT) === '1'; } catch { return false; }
}

function writeHint(on) {
  try {
    if (on) localStorage.setItem(LOGGED_IN_HINT, '1');
    else localStorage.removeItem(LOGGED_IN_HINT);
  } catch { /* storage unavailable: just no optimistic shell */ }
}

export default function App() {
  // null = unknown (no hint: wait for the check), true/false = known.
  // With the hint we start as true and let the check correct us.
  const [authenticated, setAuthenticatedState] = useState(() => (readHint() ? true : null));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const setAuthenticated = (value) => {
    writeHint(value === true);
    setAuthenticatedState(value);
  };

  useEffect(() => {
    fetch('/api/auth/check', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated === true))
      .catch(() => setAuthenticated(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only on a browser with no hint (first visit, after logout): nothing to draw yet.
  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin-slow" />
      </div>
    );
  }

  if (!authenticated) {
    return <Login onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={() => {
          fetch('/api/logout', { method: 'POST', credentials: 'include' }).then(() =>
            setAuthenticated(false)
          );
        }}
      />

      {/* Mobile hamburger */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-gray-900 text-white rounded-lg shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <main className="flex-1 overflow-auto lg:ml-64">
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/conversations/:phone" element={<ConversationDetail />} />
            <Route path="/menu" element={<MenuManager />} />
            <Route path="/handoffs" element={<Handoffs />} />
            <Route path="/spend" element={<Spend />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
