import { Outlet, Link, useLocation } from 'react-router';
import { useEffect } from 'react';

export default function App() {
  const location = useLocation();

  // Track page views for analytics (privacy-first: no external endpoints).
  useEffect(() => {
    console.log('[KinetiCare] page:', location.pathname);
  }, [location.pathname]);

  return (
    <div className="app min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-4 h-16">
            <Link to="/" className="flex items-center gap-2 font-bold text-slate-900">
              <span className="text-emerald-500">▲</span>
              <span>KinetiCare</span>
            </Link>
            <div className="ml-auto flex gap-4">
              <Link
                to="/live"
                className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                  location.pathname === '/live' || location.pathname === '/'
                    ? 'bg-emerald-500 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Live Session
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
