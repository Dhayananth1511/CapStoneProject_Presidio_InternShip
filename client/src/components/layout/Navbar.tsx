import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import {
  Compass, LogOut, User, LayoutDashboard, BarChart3,
  Moon, Sun, Menu, X,
} from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isDark = theme === 'dark';

  const handleLogout = () => {
    logout();
    setMobileOpen(false);
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinkClass = (path: string) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
      isActive(path)
        ? 'bg-primary/10 text-primary border border-primary/20'
        : isDark
        ? 'text-slate-400 hover:text-slate-200'
        : 'text-slate-600 hover:text-slate-900'
    }`;

  return (
    <nav
      className="sticky top-0 z-50 w-full navbar-bg"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary animate-pulse" aria-hidden="true" />
            <Link
              to="/"
              className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent hover:opacity-95 transition"
              aria-label="TripPlanner AI — Home"
            >
              TripPlanner AI
            </Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <>
                {user.role === 'traveler' ? (
                  <>
                    <Link to="/dashboard" className={navLinkClass('/dashboard')} aria-current={isActive('/dashboard') ? 'page' : undefined}>
                      <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                      My Trips
                    </Link>
                    <Link to="/dashboard/plan" className={navLinkClass('/dashboard/plan')} aria-current={isActive('/dashboard/plan') ? 'page' : undefined}>
                      <Compass className="h-4 w-4" aria-hidden="true" />
                      Plan Trip
                    </Link>
                  </>
                ) : (
                  <Link to="/admin" className={navLinkClass('/admin')} aria-current={isActive('/admin') ? 'page' : undefined}>
                    <BarChart3 className="h-4 w-4" aria-hidden="true" />
                    Admin Panel
                  </Link>
                )}
              </>
            ) : (
              <>
                <Link to="/" className={navLinkClass('/')}>Home</Link>
                <Link to="/login" className={navLinkClass('/login')}>Login</Link>
                <Link
                  to="/register"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-primary hover:bg-opacity-90 text-white min-w-[70px] justify-center transition active:scale-95 shadow-md shadow-primary/10"
                >
                  Register
                </Link>
              </>
            )}
          </div>

          {/* Right side: user + theme + mobile toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* User info — desktop */}
            {user && (
              <div className={`hidden sm:flex items-center gap-2 border-l pl-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
                  <User className="h-4 w-4 text-primary" aria-hidden="true" />
                </div>
                <div className="hidden lg:block text-left">
                  <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{user.name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                </div>
              </div>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
              className={`flex items-center justify-center h-8 w-8 rounded-lg transition active:scale-90 focus-visible:ring-2 focus-visible:ring-primary ${
                isDark
                  ? 'bg-slate-800 border border-slate-700 text-amber-400 hover:bg-slate-700'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 shadow-sm'
              }`}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Desktop logout */}
            {user && (
              <button
                onClick={handleLogout}
                className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition active:scale-95 ${
                  isDark
                    ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-red-400 hover:border-red-500/20'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-red-500 hover:border-red-200'
                }`}
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className={`md:hidden flex items-center justify-center h-8 w-8 rounded-lg transition ${
                isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
              }`}
              aria-expanded={mobileOpen}
              aria-controls="mobile-menu"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className={`md:hidden border-t px-4 py-4 space-y-2 animate-[fadeInUp_0.2s_ease_both] ${
            isDark ? 'border-slate-800 bg-[#0d1120]' : 'border-slate-200 bg-white'
          }`}
          role="menu"
          aria-label="Mobile navigation"
        >
          {user ? (
            <>
              {/* User identity card */}
              <div className={`flex items-center gap-3 p-3 rounded-xl mb-3 ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{user.name}</p>
                  <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                </div>
              </div>

              {user.role === 'traveler' ? (
                <>
                  <Link
                    to="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive('/dashboard')
                        ? 'bg-primary/10 text-primary'
                        : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    role="menuitem"
                  >
                    <LayoutDashboard className="h-4 w-4" /> My Trips
                  </Link>
                  <Link
                    to="/dashboard/plan"
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      isActive('/dashboard/plan')
                        ? 'bg-primary/10 text-primary'
                        : isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                    role="menuitem"
                  >
                    <Compass className="h-4 w-4" /> Plan Trip
                  </Link>
                </>
              ) : (
                <Link
                  to="/admin"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                  role="menuitem"
                >
                  <BarChart3 className="h-4 w-4" /> Admin Panel
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
                role="menuitem"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </>
          ) : (
            <>
              <Link
                to="/"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                role="menuitem"
              >
                Home
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'}`}
                role="menuitem"
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-bold bg-primary text-white transition hover:bg-opacity-90"
                role="menuitem"
              >
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
