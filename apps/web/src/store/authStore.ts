import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { AuthUser, LoginResponse } from '@lms/shared';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  remember: boolean;
  setSession: (res: LoginResponse, remember?: boolean) => void;
  setUser: (user: AuthUser) => void;
  logout: () => void;
}

/** "Remember me" keeps the session in localStorage; otherwise it lives only in this browser tab. */
const storage: StateStorage = {
  getItem: (name) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
  setItem: (name, value) => {
    let remember = true;
    try {
      remember = (JSON.parse(value) as { state?: { remember?: boolean } }).state?.remember ?? true;
    } catch {
      /* keep default */
    }
    (remember ? localStorage : sessionStorage).setItem(name, value);
    (remember ? sessionStorage : localStorage).removeItem(name);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      remember: true,
      setSession: (res, remember) =>
        set({ token: res.token, user: res.user, remember: remember ?? get().remember }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'lms-auth',
      storage: createJSONStorage(() => storage),
      partialize: (s) => ({ token: s.token, user: s.user, remember: s.remember }),
    },
  ),
);
