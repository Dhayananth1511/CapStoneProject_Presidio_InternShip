import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'traveler' | 'admin';
  hasCalendarLinked?: boolean;
}

interface AuthState {
  user: User | null;
  // accessToken lives ONLY in memory — never written to localStorage
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  setToken: (token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
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
    }),
    {
      name: 'auth-session',
      // sessionStorage: cleared on tab close — no persistent cross-tab token exposure
      storage: createJSONStorage(() => sessionStorage),
      // Only persist the user profile, NOT the token
      partialize: (state) => ({ user: state.user }),
    }
  )
);
