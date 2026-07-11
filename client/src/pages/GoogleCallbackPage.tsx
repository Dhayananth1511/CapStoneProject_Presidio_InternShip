import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const id = searchParams.get('userId');
    const name = searchParams.get('name');
    const email = searchParams.get('email');
    const role = searchParams.get('role') as 'traveler' | 'admin';

    if (accessToken && id && name && email && role) {
      // Store credentials in Zustand store
      setAuth({ id, name, email, role }, accessToken);
      toast.success('Successfully signed in with Google! 🚀');

      // Redirect depending on user role
      if (role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } else {
      toast.error('Google authentication failed. Please try again.');
      navigate('/login');
    }
  }, [searchParams, setAuth, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-dark-bg text-slate-100">
      <div className="flex flex-col items-center gap-4 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <h2 className="text-xl font-bold tracking-tight text-white glow-text">
          Completing your login...
        </h2>
        <p className="text-sm text-slate-400">
          Syncing secure sessions across VoyageFlow swarm clusters. Please wait.
        </p>
      </div>
    </div>
  );
}
