import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const hasRun = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-invoke (runs effect twice in dev)
    if (hasRun.current) return;
    hasRun.current = true;

    const accessToken = searchParams.get('accessToken');
    const id = searchParams.get('userId');
    const name = searchParams.get('name');
    const email = searchParams.get('email');
    const role = searchParams.get('role') as 'traveler' | 'admin';
    const hasCalendarLinked = searchParams.get('hasCalendarLinked') === 'true';

    if (accessToken && id && name && email && role) {
      setAuth({ id, name, email, role, hasCalendarLinked }, accessToken);
      toast.success('Successfully signed in with Google! 🚀');
      navigate(role === 'admin' ? '/admin' : '/dashboard');
    } else {
      toast.error('Google authentication failed. Please try again.');
      navigate('/login');
    }
  }, [searchParams, setAuth, navigate]);

  return (
    <div
      className={`flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}
      role="status"
      aria-live="polite"
      aria-label="Completing Google authentication"
    >
      <div className="flex flex-col items-center gap-5 text-center max-w-sm">
        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${isDark ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/15'}`}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
        <h2 className={`text-xl font-bold tracking-tight glow-text ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Completing your login…
        </h2>
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Syncing secure sessions across TripPlanner swarm clusters. Please wait.
        </p>
      </div>
    </div>
  );
}
