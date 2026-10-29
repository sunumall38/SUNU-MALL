import { colors } from "@/theme";
import type { MerchantOrder } from "@/types";

export type MerchantBucket = "new" | "shipping" | "delivered" | "other";

const SHIPPED = new Set(["picked_up", "in_transit", "out_for_delivery"]);

/** Statut d'une commande du point de vue de la boutique. */
export function merchantOrderStage(order: MerchantOrder) {
  const delivery = order.delivery?.status;
  if (order.status === "cancelled") {
    return { label: "Annulée", color: colors.danger, background: "#FEE2E2", bucket: "other" as const };
  }
  if (order.status === "pending") {
    return { label: "Paiement en attente", color: colors.warning, background: colors.warningBg, bucket: "other" as const };
  }
  if (order.status === "delivered" || delivery === "delivered") {
    return { label: "Livrée", color: colors.success, background: colors.successBg, bucket: "delivered" as const };
  }
  if (order.status === "shipped" || (delivery && SHIPPED.has(delivery))) {
    return { label: "Expédiée", color: "#1D4ED8", background: "#DBEAFE", bucket: "shipping" as const };
  }
  return { label: "À préparer", color: colors.orangeDark, background: colors.accent, bucket: "new" as const };
}

/** Étapes du suivi : faite, en cours ou à venir. */
export function merchantOrderSteps(order: MerchantOrder) {
  const stage = merchantOrderStage(order);
  const paid = order.status !== "pending" && order.status !== "cancelled";
  const shipped = stage.bucket === "shipping" || stage.bucket === "delivered";
  const delivered = stage.bucket === "delivered";
  return [
    { label: "Commandée", done: true },
    { label: "Payée", done: paid },
    { label: "Préparation", done: shipped, current: paid && !shipped },
    { label: "Expédition", done: delivered, current: shipped && !delivered },
    { label: "Livrée", done: delivered },
  ];
}

/** Montant revenant à la boutique : la commande sans les frais de livraison. */
export function orderItemsAmount(order: MerchantOrder) {
  return Number(order.total_amount) - Number(order.delivery_fee || 0);
}
