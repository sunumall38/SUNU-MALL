import { create } from "zustand";
import type { Address, CartItem, DeliveryType, PaymentMethodId } from "@/types";

/**
 * Commande en cours de saisie (adresse → livraison → paiement). Les articles
 * sont figés au démarrage : le panier peut encore changer ailleurs (site).
 */
interface CheckoutState {
  /** Boutique unique, ou `null` pour un panier multi-boutiques. */
  storeId: string | null;
  items: CartItem[];
  address: Address | null;
  deliveryType: DeliveryType;
  deliveryFee: number;
  paymentMethod: PaymentMethodId;
  start: (items: CartItem[]) => void;
  setAddress: (address: Address) => void;
  setDelivery: (type: DeliveryType, fee: number) => void;
  setPaymentMethod: (method: PaymentMethodId) => void;
  reset: () => void;
}

const initialState = {
  storeId: null,
  items: [],
  address: null,
  deliveryType: "standard" as const,
  deliveryFee: 0,
  paymentMethod: "wave" as const,
};

export const useCheckoutStore = create<CheckoutState>()((set) => ({
  ...initialState,

  start: (items) => {
    const stores = new Set(items.map((item) => item.store));
    set({ ...initialState, items, storeId: stores.size === 1 ? items[0].store : null });
  },
  setAddress: (address) => set({ address }),
  setDelivery: (deliveryType, deliveryFee) => set({ deliveryType, deliveryFee }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  reset: () => set(initialState),
}));

/** Sous-total des articles figés, en FCFA. */
export function checkoutSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + Number(item.subtotal), 0);
}
