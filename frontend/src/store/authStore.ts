import { create } from "zustand";
import type { AuthUser, Role } from "@/types";

const SESSION_KEY = "sunu-mall-session";

export type { AuthUser, Role };

export interface LoginPayload {
  user: AuthUser;
  access: string | null;
  refresh: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hasHydrated: boolean;
  loginSuccess: (payload: LoginPayload) => void;
  setTokens: (access: string, refresh?: string) => void;
  updateUser: (patch: Partial<AuthUser>) => void;
  logout: () => void;
  hasRole: (role: Role) => boolean;
  setHasHydrated: (value: boolean) => void;
}

interface StoredSession {
  user: AuthUser;
  accessToken: string | null;
  refreshToken: string | null;
}

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value ? (JSON.parse(value) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Le mode privé ou une politique navigateur peut bloquer le stockage :
    // la connexion reste alors valable jusqu'au prochain rechargement.
  }
}

const initialSession = readSession();

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: initialSession?.user ?? null,
  accessToken: initialSession?.accessToken ?? null,
  refreshToken: initialSession?.refreshToken ?? null,
  hasHydrated: true,

  loginSuccess: ({ user, access, refresh }) => {
    writeSession({ user, accessToken: access, refreshToken: refresh });
    set({ user, accessToken: access, refreshToken: refresh });
  },

  setTokens: (access, refresh) =>
    set((state) => {
      const refreshToken = refresh ?? state.refreshToken;
      if (state.user) {
        writeSession({ user: state.user, accessToken: access, refreshToken });
      }
      return { accessToken: access, refreshToken };
    }),

  updateUser: (patch) =>
    set((state) => {
      if (!state.user) return {};
      const user = { ...state.user, ...patch };
      writeSession({ user, accessToken: state.accessToken, refreshToken: state.refreshToken });
      return { user };
    }),

  logout: () => {
    writeSession(null);
    set({ user: null, accessToken: null, refreshToken: null });
  },

  hasRole: (role) => !!get().user?.roles.includes(role),

  setHasHydrated: (value) => set({ hasHydrated: value }),
}));
