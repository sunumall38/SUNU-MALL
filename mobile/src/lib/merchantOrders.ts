import { colors } from "@/theme";
import type { MerchantOrder } from "@/types";

/** Onglets de la maquette : Nouvelles (à confirmer), En cours, Livrées. */
export type MerchantBucket = "new" | "ongoing" | "delivered" | "other";

const SHIPPED = new Set(["picked_up", "in_transit", "out_for_delivery"]);

function isShipped(order: MerchantOrder) {
  const delivery = order.delivery?.status;
  return order.status === "shipped" || (delivery !== undefined && SHIPPED.has(delivery));
}

/** Statut d'une commande du point de vue de la boutique. */
export function merchantOrderStage(order: MerchantOrder) {
  if (order.status === "cancelled") {
    return { label: "Annulée", color: colors.danger, background: "#FEE2E2", bucket: "other" as const };
  }
  if (order.status === "pending") {
    return { label: "Paiement en attente", color: colors.warning, background: colors.warningBg, bucket: "other" as const };
  }
  if (order.status === "delivered" || order.delivery?.status === "delivered") {
    return { label: "Livrée", color: colors.success, background: colors.successBg, bucket: "delivered" as const };
  }
  if (isShipped(order)) {
    return { label: "Expédiée", color: "#1D4ED8", background: "#DBEAFE", bucket: "ongoing" as const };
  }
  if (order.status === "processing") {
    return order.ready_at
      ? { label: "Colis prêt", color: "#1D4ED8", background: "#DBEAFE", bucket: "ongoing" as const }
      : { label: "En préparation", color: colors.orangeDark, background: colors.accent, bucket: "ongoing" as const };
  }
  return { label: "À confirmer", color: colors.orangeDark, background: colors.accent, bucket: "new" as const };
}

/** Commande qui attend une action de la boutique : à confirmer ou colis à préparer. */
export function needsAction(order: MerchantOrder) {
  if (isShipped(order) || order.delivery?.status === "delivered") return false;
  return order.status === "paid" || (order.status === "processing" && !order.ready_at);
}

/** Étapes du suivi : faite, en cours ou à venir. */
export function merchantOrderSteps(order: MerchantOrder) {
  const stage = merchantOrderStage(order);
  const paid = order.status !== "pending" && order.status !== "cancelled";
  const delivered = stage.bucket === "delivered";
  const shipped = delivered || isShipped(order);
  const confirmed = shipped || order.status === "processing";
  const ready = shipped || Boolean(order.ready_at);
  return [
    { label: "Commandée", done: true, current: false },
    { label: "Payée", done: paid, current: false },
    { label: "Confirmée", done: confirmed, current: paid && !confirmed },
    { label: "Colis prêt", done: ready, current: confirmed && !ready },
    { label: "Expédiée", done: shipped, current: ready && !shipped },
    { label: "Livrée", done: delivered, current: shipped && !delivered },
  ];
}

/** Montant revenant à la boutique : la commande sans les frais de livraison. */
export function orderItemsAmount(order: MerchantOrder) {
  return Number(order.total_amount) - Number(order.delivery_fee || 0);
}
