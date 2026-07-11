import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Plane, LogOut, User, LayoutDashboard, BarChart3 } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-card-border bg-dark-bg/85 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary rotate-45 animate-pulse" />
            <Link to="/" className="text-xl font-bold bg-gradient-to-r from-primary to-indigo-400 bg-clip-text text-transparent hover:opacity-95 transition">
              VoyageFlow AI
            </Link>
          </div>

          {user ? (
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-4">
                {user.role === 'traveler' ? (
                  <>
                    <Link
                      to="/dashboard"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isActive('/dashboard')
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      My Trips
                    </Link>
                    <Link
                      to="/dashboard/plan"
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isActive('/dashboard/plan')
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Plane className="h-4 w-4" />
                      Plan Trip
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/admin"
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      isActive('/admin')
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-slate-400 hover:text-indigo-400'
                    }`}
                  >
                    <BarChart3 className="h-4 w-4" />
                    Admin Panel
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-4 border-l border-slate-800 pl-6">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-slate-200">{user.name}</p>
                    <p className="text-xs text-slate-405 capitalize">{user.role}</p>
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-350 hover:bg-slate-805 hover:text-red-400 hover:border-red-500/20 active:scale-95 transition"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <Link
                to="/"
                className={`text-xs font-semibold tracking-wide transition ${
                  isActive('/') ? 'text-primary' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Home
              </Link>
              <Link
                to="/login"
                className={`text-xs font-semibold tracking-wide transition ${
                  isActive('/login') ? 'text-primary' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Login
              </Link>
              <Link
                to="/register"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-primary hover:bg-opacity-90 text-white min-w-[70px] justify-center transition active:scale-95 shadow-md shadow-primary/10"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
