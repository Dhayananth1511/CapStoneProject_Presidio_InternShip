import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { Mail, Lock, Compass, AlertCircle } from 'lucide-react';
import { loginSchema } from '../schemas/authSchemas';
import type { LoginFormData } from '../schemas/authSchemas';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';
import { useLoginMutation } from '../hooks/useAuth';

export default function LoginPage() {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [selectedRole, setSelectedRole] = useState<'traveler' | 'admin'>('traveler');
  const lastStateRef = useRef('');
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    setSelectedRole(roleParam === 'admin' ? 'admin' : 'traveler');
    const googleAuth = searchParams.get('google_auth');
    const msg = searchParams.get('message');
    if (googleAuth) {
      const key = `${googleAuth}:${msg || ''}`;
      if (lastStateRef.current !== key) {
        lastStateRef.current = key;
        if (googleAuth === 'denied') toast('Google Sign-In was cancelled.', { icon: '🔕' });
        else if (googleAuth === 'error') toast.error(msg || 'Google Sign-In failed.');
        setSearchParams({}, { replace: true });
      }
    } else {
      lastStateRef.current = '';
    }
  }, [roleParam, searchParams, setSearchParams]);

  const handleGoogleLogin = async () => {
    try {
      const data = await authService.getGoogleLoginUrl('login');
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Google Sign-In is temporarily offline.');
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    loginMutation.mutate(
      { ...data, role: selectedRole },
      {
        onError: (err: any) => {
          setError('root', { message: err.response?.data?.message || 'Invalid email or password.' });
        },
        onSuccess: (resData) => {
          navigate(resData.user.role === 'admin' ? '/admin' : '/dashboard');
        },
      }
    );
  };

  const cardClass = `premium-card rounded-2xl p-6 shadow-2xl space-y-5`;
  const labelClass = `block text-xs font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`;
  const inputWrap = 'relative';
  const iconClass = 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3';
  const inputClass = `field-input`;
  const errorClass = `mt-1.5 text-[11px] text-red-500 flex items-center gap-1`;

  return (
    <div className={`flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10 sm:px-6 lg:px-8 ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
      <div className="w-full max-w-md space-y-6 fade-in-up">

        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-lg">
            <Compass className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className={`mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight glow-text ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Welcome to TripPlanner AI
          </h1>
          <p className="mt-1.5 text-xs text-slate-400">Sign in to start mapping your next journey</p>
        </div>

        {/* Card */}
        <div className={cardClass}>

          {/* Role tabs */}
          <div className="role-tab-bg flex rounded-lg p-1" role="tablist" aria-label="Login type">
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'traveler'}
              onClick={() => setSelectedRole('traveler')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary ${
                selectedRole === 'traveler' ? 'bg-primary text-white shadow-md' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Traveler Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedRole === 'admin'}
              onClick={() => setSelectedRole('admin')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary ${
                selectedRole === 'admin' ? 'bg-indigo-600 text-white shadow-md' : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Admin Login
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Email */}
            <div>
              <label htmlFor="login-email" className={labelClass}>Email Address</label>
              <div className={inputWrap}>
                <div className={iconClass}><Mail className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="login-email"
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  className={inputClass}
                  placeholder="name@example.com"
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && (
                <p id="login-email-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="login-password" className={labelClass}>Password</label>
              <div className={inputWrap}>
                <div className={iconClass}><Lock className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="login-password"
                  {...register('password')}
                  type="password"
                  autoComplete="current-password"
                  className={inputClass}
                  placeholder="••••••••"
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  aria-invalid={!!errors.password}
                />
              </div>
              {errors.password && (
                <p id="login-password-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.password.message}
                </p>
              )}
            </div>

            {/* Root error */}
            {errors.root && (
              <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3.5 text-xs text-red-500 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.root.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || loginMutation.isPending}
              className="flex w-full justify-center rounded-lg bg-primary py-3 px-4 text-xs font-bold text-white transition hover:bg-opacity-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/20 cursor-pointer active:scale-[98%]"
            >
              {isSubmitting || loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Google OAuth — traveler only */}
          {selectedRole === 'traveler' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 divider-line border-t" />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Or continue with</span>
                <div className="flex-1 divider-line border-t" />
              </div>
              <button
                onClick={handleGoogleLogin}
                type="button"
                className={`flex w-full items-center justify-center gap-2.5 rounded-lg border py-2.5 px-4 text-xs font-bold transition active:scale-[98%] cursor-pointer ${
                  isDark ? 'border-slate-700 bg-slate-900/40 hover:bg-slate-800/80 text-slate-200' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm'
                }`}
                aria-label="Login with Google"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Login with Google
              </button>
              <p className="text-center text-xs border-t pt-3 divider-line">
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>New explorer? </span>
                <Link to="/register" className="font-bold text-primary hover:text-indigo-400 hover:underline">
                  Create an account
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
