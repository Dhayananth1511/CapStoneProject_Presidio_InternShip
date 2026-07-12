import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import axios from 'axios';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'traveler' | 'admin';
}

interface AuthState {
  user: User | null;
  // accessToken lives ONLY in memory — never written to localStorage
  accessToken: string | null;
  isInitializing: boolean;
  setAuth: (user: User, token: string) => void;
  setToken: (token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isInitializing: true,
      setAuth: (user, accessToken) => {
        // Token stays in-memory (Zustand state) only.
        // ONLY the non-sensitive user profile is persisted via sessionStorage.
        set({ user, accessToken });
      },
      setToken: (token) => {
        set({ accessToken: token });
      },
      logout: () => {
        set({ user: null, accessToken: null });
      },
      isAuthenticated: () => !!get().user,
      restoreSession: async () => {
        const { user } = get();
        if (user) {
          try {
            const { data } = await axios.post(
              `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
              {},
              { withCredentials: true }
            );
            set({ accessToken: data.accessToken, isInitializing: false });
          } catch {
            set({ user: null, accessToken: null, isInitializing: false });
          }
        } else {
          set({ isInitializing: false });
        }
      },
    }),
    {
      name: 'auth-session',
      // sessionStorage: cleared on tab close — no persistent cross-tab token exposure
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the user profile, NOT the token or initializing state
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          state.restoreSession();
        }
      },
    }
  )
);
