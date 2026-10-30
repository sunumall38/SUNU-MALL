import { create } from "zustand";
import { apiDelete, apiErrorMessage, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Cart } from "@/types";

/**
 * Panier du compte connecté, tenu par le serveur : c'est le même que sur le
 * site, on le retrouve en s'y connectant avec le même compte.
 */
interface CartState {
  cart: Cart | null;
  loading: boolean;
  /** Ligne en cours de modification (désactive ses boutons). */
  pendingItemId: string | null;
  error: string | null;
  fetch: () => Promise<void>;
  add: (variantId: string, quantity: number) => Promise<boolean>;
  update: (itemId: string, quantity: number) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

export const useCartStore = create<CartState>()((set) => ({
  cart: null,
  loading: false,
  pendingItemId: null,
  error: null,

  fetch: async () => {
    set({ loading: true });
    try {
      set({ cart: await apiGet<Cart>("/shopping/cart/"), error: null });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Impossible de charger le panier.") });
    } finally {
      set({ loading: false });
    }
  },

  add: async (variantId, quantity) => {
    try {
      const cart = await apiPost<Cart>("/shopping/cart/items/", { product_variant: variantId, quantity });
      set({ cart, error: null });
      return true;
    } catch (err) {
      set({ error: apiErrorMessage(err, "Impossible d'ajouter ce produit au panier.") });
      return false;
    }
  },

  update: async (itemId, quantity) => {
    if (quantity < 1) return;
    set({ pendingItemId: itemId });
    try {
      set({ cart: await apiPatch<Cart>(`/shopping/cart/items/${itemId}/`, { quantity }), error: null });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Impossible de modifier la quantité.") });
    } finally {
      set({ pendingItemId: null });
    }
  },

  remove: async (itemId) => {
    set({ pendingItemId: itemId });
    try {
      set({ cart: await apiDelete<Cart>(`/shopping/cart/items/${itemId}/`), error: null });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Impossible de retirer cet article.") });
    } finally {
      set({ pendingItemId: null });
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({ cart: null, loading: false, pendingItemId: null, error: null }),
}));

/** Nombre d'articles (quantités cumulées), pour le badge de l'onglet Panier. */
export function cartItemCount(cart: Cart | null) {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}
