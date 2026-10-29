import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Delivery, DeliveryPartner, DeliveryPartnerDetail, Driver, Paginated, PartnerInvoice, PartnerInvoiceDetail, PartnerPayout, PartnerPayoutMethod, PartnerSpaceStats, PartnerZonePricing } from "@/types";

/** Profil de l'entreprise partenaire (détail + statistiques). */
export function getPartnerProfile() {
  return apiGet<DeliveryPartnerDetail>("/orders/partner/profile/");
}

export function updatePartnerProfile(payload: Partial<Pick<DeliveryPartner, "contact_name" | "contact_email" | "contact_phone" | "address" | "city">>) {
  return apiPatch<DeliveryPartnerDetail>("/orders/partner/profile/", payload);
}

/** Régénère la clé d'API d'intégration — le clair n'est rendu qu'une seule fois. */
export function rotatePartnerApiKey() {
  return apiPost<{ api_key: string; api_key_last4: string }>("/orders/partner/api-key/");
}

export function getPartnerPayout() {
  return apiGet<PartnerPayout>("/orders/partner/banks/");
}

/**
 * Un changement exige le mot de passe du compte ; il est tracé, confirmé par
 * e-mail au partenaire et signalé à l'administration.
 */
export function updatePartnerPayout(
  payload: Pick<PartnerPayout, "payout_account" | "payout_holder"> & {
    payout_method: PartnerPayoutMethod;
    current_password: string;
  },
) {
  return apiPatch<PartnerPayout>("/orders/partner/banks/", payload);
}

/** Tableau de bord (spec §6) : volumes, taux, revenus, impayés. */
export function getPartnerStats() {
  return apiGet<PartnerSpaceStats>("/orders/partner/stats/");
}

/** Livraisons de l'entreprise, 20 par page (plus récentes d'abord). `active` : seulement les courses en cours. */
export function listPartnerDeliveries(params: { status?: string; active?: boolean; page?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.active) qs.set("active", "1");
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return apiGet<Paginated<Delivery>>(`/orders/partner/deliveries/${query ? `?${query}` : ""}`);
}

export function listPartnerInvoices() {
  return apiGet<PartnerInvoice[]>("/orders/partner/invoices/");
}

export function getPartnerInvoice(id: number) {
  return apiGet<PartnerInvoiceDetail>(`/orders/partner/invoices/${id}/`);
}

export function listPartnerZones() {
  return apiGet<PartnerZonePricing[]>("/orders/partner/zones/");
}

/** Les prix (tarif client, coût partenaire) sont fixés par l'administration : le partenaire ajuste uniquement délai, poids max et disponibilité. */
export function updatePartnerZone(id: string, payload: Partial<Pick<PartnerZonePricing, "estimated_delay_minutes" | "max_weight_kg" | "is_available">>) {
  return apiPatch<PartnerZonePricing>(`/orders/partner/zones/${id}/`, payload);
}

/** Livreurs de SA propre entreprise (le backend scope par compte partenaire). */
export async function listCompanyDrivers() {
  const data = await apiGet<Paginated<Driver>>("/orders/drivers/");
  return data.results;
}

/** Crée un compte livreur rattaché à l'entreprise (mot de passe provisoire renvoyé une seule fois). */
export function createCompanyDriver(payload: {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  vehicle_type: string;
}) {
  return apiPost<Driver & { temporary_password: string }>("/orders/drivers/register/", payload);
}

/** Suspend / réactive un livreur (capacité, disponibilité). */
export function updateCompanyDriver(
  id: string,
  payload: Partial<Pick<Driver, "is_suspended" | "max_active_deliveries" | "vehicle_type">>,
) {
  return apiPatch<Driver>(`/orders/drivers/${id}/`, payload);
}