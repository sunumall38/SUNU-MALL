import { colors } from "@/theme";
import type { GlobalOrder, Order } from "@/types";

export type OrderBucket = "ongoing" | "delivered" | "cancelled";

export interface OrderSummary {
  kind: "order" | "global";
  id: string;
  reference: string;
  createdAt: string;
  articleCount: number;
  total: string;
  status: { label: string; color: string; background: string };
  bucket: OrderBucket;
  /** Paiement encore à régler (commande en attente). */
  paymentId: string | null;
}

const TONES = {
  pending: { color: colors.warning, background: colors.warningBg },
  progress: { color: colors.orangeDark, background: colors.accent },
  success: { color: colors.success, background: colors.successBg },
  danger: { color: colors.danger, background: "#FEE2E2" },
};

const IN_DELIVERY = new Set(["picked_up", "in_transit", "out_for_delivery"]);

function deliveryStage(deliveryStatus: string | undefined) {
  if (deliveryStatus === "delivered") return { label: "Livrée", ...TONES.success, bucket: "delivered" as const };
  if (deliveryStatus && IN_DELIVERY.has(deliveryStatus)) {
    return { label: "En livraison", ...TONES.progress, bucket: "ongoing" as const };
  }
  return { label: "En préparation", ...TONES.progress, bucket: "ongoing" as const };
}

function orderStage(order: Order) {
  switch (order.status) {
    case "pending":
      return { label: "Paiement en attente", ...TONES.pending, bucket: "ongoing" as const };
    case "cancelled":
      return { label: "Annulée", ...TONES.danger, bucket: "cancelled" as const };
    case "delivered":
      return { label: "Livrée", ...TONES.success, bucket: "delivered" as const };
    case "shipped":
      return { label: "En livraison", ...TONES.progress, bucket: "ongoing" as const };
    default:
      return deliveryStage(order.delivery?.status);
  }
}

function globalStage(order: GlobalOrder) {
  if (order.status === "pending") return { label: "Paiement en attente", ...TONES.pending, bucket: "ongoing" as const };
  if (order.status === "cancelled") return { label: "Annulée", ...TONES.danger, bucket: "cancelled" as const };
  return deliveryStage(order.delivery?.status);
}

function pendingPayment(order: Order | GlobalOrder) {
  return order.status === "pending" && order.payment && order.payment.status !== "success" ? order.payment.id : null;
}

export function summarizeOrder(order: Order): OrderSummary {
  const { bucket, ...status } = orderStage(order);
  return {
    kind: "order",
    id: order.id,
    reference: `#${order.id.slice(0, 8).toUpperCase()}`,
    createdAt: order.created_at,
    articleCount: order.items.reduce((n, item) => n + item.quantity, 0),
    total: order.total_amount,
    status,
    bucket,
    paymentId: pendingPayment(order),
  };
}

export function summarizeGlobalOrder(order: GlobalOrder): OrderSummary {
  const { bucket, ...status } = globalStage(order);
  return {
    kind: "global",
    id: order.id,
    reference: `#${order.reference}`,
    createdAt: order.created_at,
    articleCount: order.orders.reduce((n, o) => n + o.items.reduce((m, item) => m + item.quantity, 0), 0),
    total: order.total_amount,
    status,
    bucket,
    paymentId: pendingPayment(order),
  };
}

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** « 15 oct. 2026 » (sans dépendre des données de langue d'Intl). */
export function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
