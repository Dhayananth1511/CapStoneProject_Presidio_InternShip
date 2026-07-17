import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, Compass, AlertCircle } from 'lucide-react';
import { registerSchema } from '../schemas/authSchemas';
import type { RegisterFormData } from '../schemas/authSchemas';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import { authService } from '../services/authService';
import { useRegisterMutation } from '../hooks/useAuth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isDark = theme === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();
  const lastStateRef = useRef('');
  const registerMutation = useRegisterMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RegisterFormData>({ resolver: zodResolver(registerSchema) });

  useEffect(() => {
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
  }, [searchParams, setSearchParams]);

  const handleGoogleLogin = async () => {
    try {
      const data = await authService.getGoogleLoginUrl('register');
      if (data.authUrl) window.location.href = data.authUrl;
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Google Sign-In is temporarily offline.');
    }
  };

  const onSubmit = async (data: RegisterFormData) => {
    registerMutation.mutate(
      data,
      {
        onError: (err: any) => {
          setError('root', { message: err.response?.data?.message || 'Registration failed. Email might already be taken.' });
        },
        onSuccess: () => {
          navigate('/dashboard');
        },
      }
    );
  };

  const labelClass = `block text-xs font-semibold mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`;
  const iconWrap = 'pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3';
  const errorClass = `mt-1 text-[11px] text-red-500 flex items-center gap-1`;

  return (
    <div className={`flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10 sm:px-6 lg:px-8 ${isDark ? 'bg-[#090d16]' : 'bg-slate-50'}`}>
      <div className="w-full max-w-md space-y-6 fade-in-up">

        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20 shadow-lg">
            <Compass className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <h1 className={`mt-5 text-2xl sm:text-3xl font-extrabold tracking-tight glow-text ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Start Your Journey
          </h1>
          <p className="mt-2 text-sm text-slate-400">Create an account to access the AI travel agent swarm</p>
        </div>

        {/* Card */}
        <div className="premium-card rounded-2xl p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate aria-label="Registration form">

            {/* Full Name */}
            <div>
              <label htmlFor="reg-name" className={labelClass}>Full Name</label>
              <div className="relative">
                <div className={iconWrap}><User className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="reg-name"
                  {...register('name')}
                  type="text"
                  autoComplete="name"
                  className="field-input"
                  placeholder="John Doe"
                  aria-describedby={errors.name ? 'reg-name-error' : undefined}
                  aria-invalid={!!errors.name}
                />
              </div>
              {errors.name && (
                <p id="reg-name-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.name.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className={labelClass}>Email Address</label>
              <div className="relative">
                <div className={iconWrap}><Mail className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="reg-email"
                  {...register('email')}
                  type="email"
                  autoComplete="email"
                  className="field-input"
                  placeholder="name@example.com"
                  aria-describedby={errors.email ? 'reg-email-error' : undefined}
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && (
                <p id="reg-email-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className={labelClass}>Password</label>
              <div className="relative">
                <div className={iconWrap}><Lock className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="reg-password"
                  {...register('password')}
                  type="password"
                  autoComplete="new-password"
                  className="field-input"
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  aria-describedby={errors.password ? 'reg-password-error' : undefined}
                  aria-invalid={!!errors.password}
                />
              </div>
              {errors.password && (
                <p id="reg-password-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="reg-confirm" className={labelClass}>Confirm Password</label>
              <div className="relative">
                <div className={iconWrap}><Lock className="h-4 w-4 text-slate-400" aria-hidden="true" /></div>
                <input
                  id="reg-confirm"
                  {...register('confirmPassword')}
                  type="password"
                  autoComplete="new-password"
                  className="field-input"
                  placeholder="••••••••"
                  aria-describedby={errors.confirmPassword ? 'reg-confirm-error' : undefined}
                  aria-invalid={!!errors.confirmPassword}
                />
              </div>
              {errors.confirmPassword && (
                <p id="reg-confirm-error" role="alert" className={errorClass}>
                  <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />{errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Root error */}
            {errors.root && (
              <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-500 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errors.root.message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || registerMutation.isPending}
              className="flex w-full justify-center rounded-lg bg-primary py-3 px-4 text-sm font-bold text-white transition hover:bg-opacity-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-primary/20 active:scale-[98%]"
            >
              {isSubmitting || registerMutation.isPending ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          {/* Google */}
          <div className="mt-5 space-y-3">
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
              aria-label="Register with Google"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Register with Google
            </button>
          </div>

          <p className="mt-5 text-center text-sm border-t pt-4 divider-line">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Already registered? </span>
            <Link to="/login" className="font-semibold text-primary hover:text-indigo-400 hover:underline">
              Sign in here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
