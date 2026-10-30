import { create } from "zustand";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { Wishlist } from "@/types";

/** Favoris du compte connecté, tenus par le serveur (les mêmes que sur le site). */
interface WishlistState {
  wishlist: Wishlist | null;
  loading: boolean;
  /** Produits en cours d'ajout ou de retrait. */
  pending: string[];
  fetch: () => Promise<void>;
  toggle: (productId: string) => Promise<void>;
  reset: () => void;
}

export const useWishlistStore = create<WishlistState>()((set, get) => ({
  wishlist: null,
  loading: false,
  pending: [],

  fetch: async () => {
    set({ loading: true });
    try {
      set({ wishlist: await apiGet<Wishlist>("/shopping/wishlist/") });
    } catch {
      // Les cœurs restent vides : rien de bloquant pour l'achat.
    } finally {
      set({ loading: false });
    }
  },

  toggle: async (productId) => {
    if (get().pending.includes(productId)) return;
    const liked = isFavorite(get().wishlist, productId);
    set((s) => ({ pending: [...s.pending, productId] }));
    try {
      const wishlist = liked
        ? await apiDelete<Wishlist>(`/shopping/wishlist/items/${productId}/`)
        : await apiPost<Wishlist>("/shopping/wishlist/items/", { product: productId });
      set({ wishlist });
    } catch {
      // Échec silencieux : le cœur garde son état précédent.
    } finally {
      set((s) => ({ pending: s.pending.filter((id) => id !== productId) }));
    }
  },

  reset: () => set({ wishlist: null, loading: false, pending: [] }),
}));

export function isFavorite(wishlist: Wishlist | null, productId: string) {
  return wishlist?.items.some((item) => item.product === productId) ?? false;
}
