import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Mail, Lock, Plane, AlertCircle } from 'lucide-react';
import { loginSchema } from '../schemas/authSchemas';
import type { LoginFormData } from '../schemas/authSchemas';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import api from '../lib/axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  
  // Local role state selector
  const [selectedRole, setSelectedRole] = useState<'traveler' | 'admin'>('traveler');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Handle initialization and search params sync + google auth toast errors
  useEffect(() => {
    if (roleParam === 'admin') {
      setSelectedRole('admin');
    } else {
      setSelectedRole('traveler');
    }

    const googleAuth = searchParams.get('google_auth');
    const msg = searchParams.get('message');
    if (googleAuth === 'denied') {
      toast('Google Sign-In was cancelled.', { icon: '🔕' });
    } else if (googleAuth === 'error') {
      toast.error(msg || 'Google Sign-In failed. Please try again.');
    }
  }, [roleParam, searchParams]);

  const handleGoogleLogin = async () => {
    try {
      const res = await api.get('/auth/google-login?mode=login');
      if (res.data.authUrl) {
        window.location.href = res.data.authUrl;
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Google Sign-In is temporarily offline.');
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await api.post('/auth/login', { ...data, role: selectedRole });
      setAuth(res.data.user, res.data.accessToken);
      
      // If user is admin redirect to /admin, else to /dashboard
      if (res.data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError('root', {
        message: err.response?.data?.message || 'Invalid email or password. Please try again.',
      });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-bg px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        
        {/* Banner header logo */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
            <Plane className="h-8 w-8 text-primary rotate-45" />
          </div>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white glow-text">
            Welcome to VoyageFlow AI
          </h2>
          <p className="mt-1.5 text-xs text-slate-400">
            Sign in to start mapping your next journey
          </p>
        </div>

        {/* Unified Card Container */}
        <div className="premium-card rounded-2xl p-6 shadow-2xl space-y-6">
          
          {/* Interactive Role Selection Row */}
          <div className="flex rounded-lg bg-slate-900/60 p-1 border border-slate-800">
            <button
              type="button"
              onClick={() => setSelectedRole('traveler')}
              className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-md transition cursor-pointer select-none ${
                selectedRole === 'traveler'
                  ? 'bg-primary text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Traveler Login
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('admin')}
              className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-md transition cursor-pointer select-none ${
                selectedRole === 'admin'
                  ? 'bg-indigo-500 text-white shadow-md focus:outline-none'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Admin Login
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-350">
                Email Address
              </label>
              <div className="relative mt-1.5 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  {...register('email')}
                  type="email"
                  className="block w-full rounded-lg border border-slate-705 bg-slate-805/50 py-2.5 pl-10 pr-3 text-xs text-slate-200 placeholder-slate-500 transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="name@example.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-[11px] text-red-450 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-350">
                Password
              </label>
              <div className="relative mt-1.5 rounded-md shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  {...register('password')}
                  type="password"
                  className="block w-full rounded-lg border border-slate-705 bg-slate-850/50 py-2.5 pl-10 pr-3 text-xs text-slate-205 placeholder-slate-500 transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                  placeholder="••••••••"
                />
              </div>
              {errors.password && (
                <p className="mt-1.5 text-[11px] text-red-450 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.password.message}
                </p>
              )}
            </div>

            {errors.root && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3.5 text-xs text-red-440 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{errors.root.message}</span>
              </div>
            )}



            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative flex w-full justify-center rounded-lg bg-primary py-3 px-4 text-xs font-bold text-white transition hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/20 cursor-pointer"
              >
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </form>

          {/* Google Sign-In Section */}
          {selectedRole === 'traveler' && (
            <div className="mt-4 space-y-4">
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="mx-3 flex-shrink text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Or continue with
                </span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              <button
                onClick={handleGoogleLogin}
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900/40 hover:bg-slate-800/80 py-2.5 px-4 text-xs font-bold text-slate-205 transition active:scale-[98%] cursor-pointer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Login with Google
              </button>
            </div>
          )}


          {/* Conditional Registration: Only visible for Travelers */}
          {selectedRole === 'traveler' && (
            <div className="text-center text-xs border-t border-card-border/40 pt-4">
              <span className="text-slate-400">New explorer? </span>
              <Link to="/register" className="font-bold text-primary hover:text-indigo-400 hover:underline">
                Create an account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
