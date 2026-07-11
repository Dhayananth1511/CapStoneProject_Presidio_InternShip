import type { ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';

// Initialize React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // Keep responses cached and fresh for 5 mins
      refetchOnWindowFocus: false,
    },
  },
});

// Guard: Redirect unauthenticated travelers to login page
const PrivateRoute = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  return user ? <>{children}</> : <Navigate to="/login" replace />;
};

// Guard: Redirect non-admins to main dashboard workspace
const AdminRoute = ({ children }: { children: ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <ChatPage />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/admin"
            element={
              <PrivateRoute>
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              </PrivateRoute>
            }
          />

          {/* Root redirect to main dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
