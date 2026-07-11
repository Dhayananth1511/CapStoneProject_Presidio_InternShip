import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GoogleCallbackPage from './pages/GoogleCallbackPage';
import ChatPage from './pages/ChatPage';
import MyTripsPage from './pages/MyTripsPage';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

// Initialize React Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen flex flex-col bg-dark-bg text-slate-100 selection:bg-primary/30 selection:text-white">
          <Toaster
            position="top-right"
            toastOptions={{
              style: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', fontSize: '13px' },
              success: { iconTheme: { primary: '#6366f1', secondary: '#fff' } },
              error: { iconTheme: { primary: '#f87171', secondary: '#fff' } },
            }}
          />
          <Navbar />
          <main className="flex-1">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/auth/callback" element={<GoogleCallbackPage />} />

              {/* Protected Traveler Routes */}
              <Route element={<ProtectedRoute allowedRoles={['traveler']} />}>
                <Route path="/dashboard" element={<MyTripsPage />} />
                <Route path="/dashboard/plan" element={<ChatPage />} />
              </Route>

              {/* Protected Admin Routes */}
              <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                <Route path="/admin" element={<AdminDashboard />} />
              </Route>

              {/* Fallback Redirection */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
