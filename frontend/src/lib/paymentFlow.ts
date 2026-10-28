/**
 * Parcours de paiement commun (commande, commande multi-boutiques,
 * abonnement, nouvelle tentative).
 *
 * - En production, `initiate` renvoie l'URL de la page de paiement Wave ou
 *   Orange Money : le navigateur y est envoyé, puis revient sur
 *   /paiement/retour où le backend confirme le statut auprès du fournisseur.
 * - En mode sandbox, aucune page externe : l'appelant affiche les boutons de
 *   simulation.
 */
import { useEffect, useState } from "react";
import * as paymentsApi from "@/api/payments";
import { PAYMENT_METHODS, type PaymentMethodOption } from "@/lib/paymentMethods";
import type { Payment } from "@/types";

/** Page de retour : intervalle et nombre de vérifications avant « en cours ». */
export const POLL_INTERVAL_MS = 3000;
export const MAX_CHECKS = 20;

/** Page où mène un paiement confirmé, selon l'objet réglé. */
export function successDestination(payment: Payment): string {
  if (payment.order) return `/order-confirmed?order=${payment.order}`;
  if (payment.global_order) return `/order-confirmed?gorder=${payment.global_order}`;
  return "/subscriptions?paiement=ok";
}

export type StartPaymentResult =
  | { kind: "redirect"; url: string }
  | { kind: "sandbox"; message: string };

export async function startPayment(paymentId: string): Promise<StartPaymentResult> {
  const result = await paymentsApi.initiatePayment(paymentId);
  if (result.checkout_url) {
    window.location.assign(result.checkout_url);
    return { kind: "redirect", url: result.checkout_url };
  }
  return { kind: "sandbox", message: result.message ?? "Mode test : aucune vraie transaction n'est envoyée." };
}

let cache: paymentsApi.PaymentMethodsResult | null = null;
let pending: Promise<paymentsApi.PaymentMethodsResult> | null = null;

function loadMethods() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = paymentsApi
      .getPaymentMethods()
      .then((res) => {
        cache = res;
        return res;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** Réservé aux tests : oublie la liste mise en cache. */
export function resetPaymentMethodsCache() {
  cache = null;
  pending = null;
}

/**
 * Moyens de paiement proposés par le backend, dans l'ordre et avec les
 * logos du frontend. Tant que la réponse n'est pas arrivée, `methods` est
 * vide : on n'affiche jamais un moyen que le serveur refuserait.
 */
export function usePaymentMethods() {
  const [state, setState] = useState<{
    methods: PaymentMethodOption[];
    sandbox: boolean;
    loading: boolean;
    error: boolean;
  }>(() => ({
    methods: cache ? PAYMENT_METHODS.filter((m) => cache!.methods.some((s) => s.id === m.id)) : [],
    sandbox: cache?.sandbox ?? false,
    loading: !cache,
    error: false,
  }));

  useEffect(() => {
    let cancelled = false;
    loadMethods()
      .then((res) => {
        if (cancelled) return;
        setState({
          methods: PAYMENT_METHODS.filter((m) => res.methods.some((s) => s.id === m.id)),
          sandbox: res.sandbox,
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: true }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
