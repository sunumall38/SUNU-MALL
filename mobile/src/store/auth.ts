import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { AuthResponse, AuthUser, Role } from "@/types";

// Jetons et profil dans le trousseau chiffré du téléphone, en clés séparées
// pour rester sous la limite de taille de certaines versions d'iOS.
const KEYS = { access: "sunumall.access", refresh: "sunumall.refresh", user: "sunumall.user" } as const;

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hasHydrated: boolean;
  hydrate: () => Promise<void>;
  loginSuccess: (payload: AuthResponse) => Promise<void>;
  setTokens: (access: string, refresh?: string | null) => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: Role) => boolean;
}

async function save(key: string, value: string | null) {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Trousseau indisponible : la session reste valable jusqu'à la fermeture de l'appli.
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  hasHydrated: false,

  hydrate: async () => {
    try {
      const [access, refresh, rawUser] = await Promise.all([
        SecureStore.getItemAsync(KEYS.access),
        SecureStore.getItemAsync(KEYS.refresh),
        SecureStore.getItemAsync(KEYS.user),
      ]);
      const user = rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
      if (user && refresh) set({ user, accessToken: access, refreshToken: refresh });
    } catch {
      // Session illisible : on repart déconnecté.
    }
    set({ hasHydrated: true });
  },

  loginSuccess: async ({ user, access, refresh }) => {
    set({ user, accessToken: access, refreshToken: refresh });
    await Promise.all([save(KEYS.access, access), save(KEYS.refresh, refresh), save(KEYS.user, JSON.stringify(user))]);
  },

  setTokens: async (access, refresh) => {
    const refreshToken = refresh ?? get().refreshToken;
    set({ accessToken: access, refreshToken });
    await Promise.all([save(KEYS.access, access), save(KEYS.refresh, refreshToken)]);
  },

  updateUser: async (patch) => {
    const current = get().user;
    if (!current) return;
    const user = { ...current, ...patch };
    set({ user });
    await save(KEYS.user, JSON.stringify(user));
  },

  logout: async () => {
    set({ user: null, accessToken: null, refreshToken: null });
    await Promise.all([save(KEYS.access, null), save(KEYS.refresh, null), save(KEYS.user, null)]);
  },

  hasRole: (role) => get().user?.roles.includes(role) ?? false,
}));
