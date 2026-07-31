import { create } from "zustand";
import { TOKEN_KEY } from "../config";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "SUPER_ADMIN" | "ADMIN" | "QA_LEAD" | "QA" | "ENGINEER" | "VIEWER";
  mustChangePassword: boolean;
  active: boolean;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean; // true once the initial `me` check has resolved
  setUser: (u: AuthUser | null) => void;
  setReady: (r: boolean) => void;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
  signIn: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    set({ user });
  },
  signOut: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null });
  },
}));
