import { create } from "zustand";
import { apiErrorMessage } from "@/lib/api";
import { getMyKyc, getMyStore, getSubscriptionState } from "@/lib/merchant";
import type { OwnStore, SellerKyc, SubscriptionState } from "@/types";

/** Boutique, dossier d'identité et abonnement du commerçant connecté. */
interface MerchantState {
  loaded: boolean;
  error: string | null;
  store: OwnStore | null;
  kyc: SellerKyc | null;
  account: SubscriptionState | null;
  load: (userId: string) => Promise<void>;
  reset: () => void;
}

export const useMerchantStore = create<MerchantState>()((set) => ({
  loaded: false,
  error: null,
  store: null,
  kyc: null,
  account: null,

  load: async (userId) => {
    set({ error: null });
    try {
      const [store, kyc, account] = await Promise.all([
        getMyStore(userId),
        getMyKyc(),
        // L'abonnement sert au quota de produits : son absence ne bloque pas l'espace.
        getSubscriptionState().catch(() => null),
      ]);
      set({ store, kyc, account, loaded: true });
    } catch (err) {
      set({ error: apiErrorMessage(err, "Impossible de charger votre boutique.") });
    }
  },

  reset: () => set({ loaded: false, error: null, store: null, kyc: null, account: null }),
}));

/** Le dossier d'identité ouvre l'espace vendeur une fois envoyé (comme sur le site). */
export function kycAllowsAccess(kyc: SellerKyc | null) {
  return kyc !== null && ["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(kyc.status);
}
