import { apiGet, apiPost } from "@/lib/api";
import type { InitiatePaymentResult, Payment, PaymentMethodsResult } from "@/types";

/** Moyens de paiement réellement ouverts sur le serveur. */
export function getPaymentMethods() {
  return apiGet<PaymentMethodsResult>("/payments/methods/", { auth: false });
}

/**
 * Démarre le paiement. `return_to: "app"` : après Wave / Orange Money, la
 * page de retour du site invite à revenir dans l'appli au lieu de demander
 * de se connecter sur le navigateur.
 */
export function initiatePayment(paymentId: string) {
  return apiPost<InitiatePaymentResult>(`/payments/${paymentId}/initiate/`, { return_to: "app" });
}

/** Statut vérifié par le serveur auprès du fournisseur (jamais déclaré par l'appli). */
export function refreshPayment(paymentId: string) {
  return apiPost<Payment>(`/payments/${paymentId}/refresh/`);
}

/** Mode test uniquement : simule la réponse du fournisseur. */
export function sandboxConfirmPayment(paymentId: string, outcome: "success" | "failed") {
  return apiPost<Payment>(`/payments/${paymentId}/sandbox-confirm/`, { outcome });
}
