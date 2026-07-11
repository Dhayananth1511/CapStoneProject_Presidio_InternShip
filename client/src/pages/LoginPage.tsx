import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Mail, Lock, Plane, AlertCircle, ShieldAlert } from 'lucide-react';
import { loginSchema } from '../schemas/authSchemas';
import type { LoginFormData } from '../schemas/authSchemas';
import { useAuthStore } from '../store/authStore';
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
    setValue,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  // Handle initialization and search params sync
  useEffect(() => {
    if (roleParam === 'admin') {
      setSelectedRole('admin');
    } else {
      setSelectedRole('traveler');
    }
  }, [roleParam]);

  // Autofill credentials when selected role changes (helpful for test logins)
  useEffect(() => {
    if (selectedRole === 'admin') {
      setValue('email', 'admin@voyage.com');
      setValue('password', 'Password123');
    } else {
      setValue('email', 'traveler@voyage.com');
      setValue('password', 'Password123');
    }
  }, [selectedRole, setValue]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await api.post('/auth/login', data);
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

            <div className="rounded-lg border border-indigo-500/10 bg-indigo-500/5 p-3 text-[11px] text-indigo-300 flex items-center gap-1.5 mt-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-indigo-400" />
              <span>
                Prefilled test credentials loaded for {selectedRole === 'admin' ? 'Admin' : 'Traveler'} workspace!
              </span>
            </div>

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
