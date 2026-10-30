import type { OrderStatus } from "@/types";
import { PAYMENT_METHODS } from "@/lib/paymentMethods";

/** Libellés français des statuts de commande (jamais le code brut à l'écran). */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  processing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const ORDER_STATUS_VARIANT: Record<OrderStatus, "default" | "success" | "warning" | "danger"> = {
  pending: "default",
  paid: "success",
  processing: "warning",
  shipped: "warning",
  delivered: "success",
  cancelled: "danger",
};

/** Commandes réellement encaissées (comptent dans le chiffre d'affaires). */
export const PAID_ORDER_STATUSES: ReadonlySet<string> = new Set(["paid", "processing", "shipped", "delivered"]);

/** Statuts qui permettent d'affecter un livreur (payée, pas encore livrée). */
export const ASSIGNABLE_ORDER_STATUSES: ReadonlySet<string> = new Set(["paid", "processing", "shipped"]);

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status as OrderStatus] ?? status;
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  success: "Réussi",
  failed: "Échoué",
  refunded: "Remboursé",
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHODS.find((m) => m.id === method)?.label ?? method;
}

export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  standard: "Livraison standard",
  express: "Livraison express",
  pickup: "Retrait en boutique",
};
