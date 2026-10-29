import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { DeliveryPartner, DeliveryPartnerDetail, Paginated, PartnerInvoice } from "@/types";

export async function listAdminPartners(params?: { page?: number }) {
  const qs = params?.page ? `?page=${params.page}` : "";
  const data = await apiGet<Paginated<DeliveryPartner>>(`/orders/partners/${qs}`);
  return data.results;
}

export function getAdminPartner(id: string) {
  return apiGet<DeliveryPartnerDetail>(`/orders/partners/${id}/`);
}

export function createAdminPartner(payload: {
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  city: string;
}) {
  return apiPost<DeliveryPartner>("/orders/partners/", payload);
}

export function updateAdminPartner(id: string, payload: Partial<Pick<DeliveryPartner, "contact_name" | "contact_email" | "contact_phone" | "address" | "city">>) {
  return apiPatch<DeliveryPartner>(`/orders/partners/${id}/`, payload);
}

export function activateAdminPartner(id: string) {
  return apiPost<DeliveryPartnerDetail>(`/orders/partners/${id}/activate/`);
}

export function suspendAdminPartner(id: string) {
  return apiPost<DeliveryPartnerDetail>(`/orders/partners/${id}/suspend/`);
}

/**
 * Crée le compte « partenaire » à partir de l'email de contact et le lie à
 * l'entreprise. `temporary_password` n'est renvoyé qu'une fois (null si un
 * compte partenaire existant a simplement été lié).
 */
export function createAdminPartnerAccount(id: string) {
  return apiPost<DeliveryPartnerDetail & { temporary_password: string | null }>(`/orders/partners/${id}/create-account/`);
}

/** Régénère la clé d'API — le clair n'est renvoyé qu'une seule fois. */
export function rotateAdminPartnerApiKey(id: string) {
  return apiPost<{ api_key: string; api_key_last4: string }>(`/orders/partners/${id}/rotate-api-key/`);
}

/** Factures partenaires (toutes entreprises, toutes les pages), filtrables par statut. */
export async function listAdminPartnerInvoices(status?: "pending" | "paid") {
  const invoices: PartnerInvoice[] = [];
  for (let page = 1; ; page += 1) {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set("status", status);
    const data = await apiGet<Paginated<PartnerInvoice>>(`/orders/partner-invoices/?${params.toString()}`);
    invoices.push(...data.results);
    if (!data.next) return invoices;
  }
}

/** À appeler une fois le virement au partenaire effectué. */
export function markPartnerInvoicePaid(id: number) {
  return apiPost<PartnerInvoice>(`/orders/partner-invoices/${id}/mark-paid/`);
}
