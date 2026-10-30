import { apiGet, apiPost } from "@/lib/api";
import type { Address, CheckoutPayload, CreatedOrder, DeliveryType, GlobalOrder, Order, OrderDelivery, Paginated } from "@/types";

export async function listAddresses() {
  const data = await apiGet<Paginated<Address>>("/orders/addresses/");
  return data.results;
}

export function createAddress(payload: {
  label: string;
  street: string;
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
}) {
  return apiPost<Address>("/orders/addresses/", payload);
}

type QuoteItems = { product_variant: string; quantity: number }[];

/**
 * Frais de livraison calculés par le serveur (jamais dans l'appli) : par
 * boutique pour une commande classique, sur les articles sinon. Le checkout
 * recalcule toujours ce même montant.
 */
export async function quoteDelivery(storeId: string | null, items: QuoteItems, addressId: string, type: DeliveryType) {
  const data = storeId
    ? await apiPost<{ delivery_fee: string }>("/orders/quote/", { store: storeId, address: addressId, delivery_type: type })
    : await apiPost<{ delivery_fee: string }>("/orders/delivery-calculate/", {
        items,
        address: addressId,
        delivery_type: type,
      });
  return parseFloat(data.delivery_fee);
}

export function checkout(payload: CheckoutPayload) {
  return apiPost<CreatedOrder>("/orders/checkout/", payload);
}

export async function listOrders() {
  const data = await apiGet<Paginated<Order>>("/orders/");
  return data.results;
}

export async function listGlobalOrders() {
  const data = await apiGet<Paginated<GlobalOrder>>("/orders/global-orders/");
  return data.results;
}

export function getOrder(id: string) {
  return apiGet<Order>(`/orders/${id}/`);
}

/** Le client valide la réception avec le code remis par le livreur. */
export function confirmDelivery(deliveryId: string, code: string) {
  return apiPost<OrderDelivery>(`/orders/deliveries/${deliveryId}/confirm/`, { code });
}

export function getGlobalOrder(id: string) {
  return apiGet<GlobalOrder>(`/orders/global-orders/${id}/`);
}
