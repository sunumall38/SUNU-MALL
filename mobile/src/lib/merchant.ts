import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { colors } from "@/theme";
import type {
  MerchantOrder,
  OwnStore,
  Paginated,
  Product,
  ProductImage,
  ProductVariant,
  SalesDay,
  SellerKyc,
  SellerWallet,
  StoreSummary,
  SubscriptionState,
} from "@/types";

/** La boutique du commerçant (une seule par vendeur), quel que soit son statut. */
export async function getMyStore(userId: string) {
  const data = await apiGet<Paginated<OwnStore>>(`/catalog/stores/?owner=${userId}`);
  return data.results[0] ?? null;
}

/** Dossier d'identité du vendeur, ou null s'il n'a jamais été envoyé. */
export async function getMyKyc() {
  try {
    return await apiGet<SellerKyc>("/kyc/seller-kyc/me/");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function getSubscriptionState() {
  return apiGet<SubscriptionState>("/monetization/subscription/me/");
}

export function getStoreSummary(storeId: string) {
  return apiGet<StoreSummary>(`/analytics/store-summary/?store=${storeId}`);
}

/** Ventes par jour, du plus récent au plus ancien. */
export function listSales(storeId: string) {
  return apiGet<SalesDay[]>(`/analytics/sales/?store=${storeId}`);
}

export function listStoreBestSellers(storeId: string) {
  return apiGet<(Product & { sold_quantity?: number })[]>(`/catalog/products/best_sellers/?store=${storeId}`);
}

/**
 * Commandes reçues par la boutique. L'API mêle les achats personnels du
 * commerçant : on ne garde que celles de sa boutique (3 pages = 60 commandes).
 */
export async function listStoreOrders(storeId: string, maxPages = 3) {
  const orders: MerchantOrder[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await apiGet<Paginated<MerchantOrder>>(`/orders/?page=${page}`);
    orders.push(...data.results.filter((order) => order.store === storeId));
    if (!data.next) break;
  }
  return orders;
}

export function getStoreOrder(id: string) {
  return apiGet<MerchantOrder>(`/orders/${id}/`);
}

/** La boutique accepte une commande payée : elle passe « en préparation ». */
export function confirmOrder(id: string) {
  return apiPost<MerchantOrder>(`/orders/${id}/confirm/`);
}

/** Colis prêt : le livreur peut passer (confirme aussi la commande si besoin). */
export function markOrderReady(id: string) {
  return apiPost<MerchantOrder>(`/orders/${id}/ready/`);
}

export function cancelOrder(id: string) {
  return apiPost<MerchantOrder>(`/orders/${id}/cancel/`);
}

/** Produits de la boutique, brouillons compris (requête authentifiée). */
export function listMyProducts(storeId: string, page: number, search?: string) {
  const qs = new URLSearchParams({ store: storeId, page: String(page) });
  if (search) qs.set("search", search);
  return apiGet<Paginated<Product>>(`/catalog/products/?${qs.toString()}`);
}

export function getMyProduct(id: string) {
  return apiGet<Product>(`/catalog/products/${id}/`);
}

export function createProduct(payload: {
  store: string;
  category: number | null;
  name: string;
  description: string;
  base_price: string;
  status: "active" | "draft";
}) {
  return apiPost<Product>("/catalog/products/", payload);
}

/** Variante unique du produit, avec son stock de départ (non modifiable ensuite par l'API). */
export function createVariant(payload: { product: string; price: string; initial_quantity: number }) {
  return apiPost<ProductVariant>("/catalog/variants/", payload);
}

/** Libellé et couleurs du statut d'un produit. */
export const PRODUCT_STATUS = {
  active: { label: "Actif", color: colors.success, background: colors.successBg },
  draft: { label: "Brouillon", color: colors.warning, background: colors.warningBg },
  inactive: { label: "Désactivé", color: colors.mutedForeground, background: colors.muted },
} as const;

/** Le prix vendu est celui de la variante : on le change aussi. */
export function updateVariantPrice(id: string, price: string) {
  return apiPatch<ProductVariant>(`/catalog/variants/${id}/`, { price });
}

export function deleteProductImage(productId: string, imageId: string) {
  return apiDelete<void>(`/catalog/products/${productId}/images/?image_id=${imageId}`);
}

export function updateProduct(id: string, payload: Partial<Pick<Product, "name" | "description" | "base_price" | "status">>) {
  return apiPatch<Product>(`/catalog/products/${id}/`, payload);
}

/** Photo choisie sur le téléphone, envoyée en multipart (champ `image`). */
export function uploadProductImage(productId: string, photo: { uri: string; fileName?: string | null; mimeType?: string | null }) {
  const form = new FormData();
  form.append("image", {
    uri: photo.uri,
    name: photo.fileName ?? "photo.jpg",
    type: photo.mimeType ?? "image/jpeg",
  } as unknown as Blob);
  return apiPost<ProductImage>(`/catalog/products/${productId}/images/`, form);
}

export function getWallet() {
  return apiGet<SellerWallet>("/commissions/wallet/me/");
}

export type KycDocumentType = "cni" | "passeport" | "permis" | "titre_sejour" | "autre";

export const KYC_DOCUMENT_TYPES: { id: KycDocumentType; label: string }[] = [
  { id: "cni", label: "Carte d'identité" },
  { id: "passeport", label: "Passeport" },
  { id: "permis", label: "Permis" },
  { id: "titre_sejour", label: "Titre de séjour" },
  { id: "autre", label: "Autre" },
];

function photoPart(photo: { uri: string; fileName?: string | null; mimeType?: string | null }, fallback: string) {
  return { uri: photo.uri, name: photo.fileName ?? fallback, type: photo.mimeType ?? "image/jpeg" } as unknown as Blob;
}

/** Dossier d'identité du vendeur : pièce recto / verso (moins de 8 Mo chacune). */
export function submitKyc(payload: {
  documentType: KycDocumentType;
  front: { uri: string; fileName?: string | null; mimeType?: string | null };
  back: { uri: string; fileName?: string | null; mimeType?: string | null };
  address: string;
}) {
  const form = new FormData();
  form.append("document_type", payload.documentType);
  form.append("document_front", photoPart(payload.front, "recto.jpg"));
  form.append("document_back", photoPart(payload.back, "verso.jpg"));
  if (payload.address) form.append("address", payload.address);
  return apiPost<SellerKyc>("/kyc/seller-kyc/submit/", form);
}

export function listStoreCategories() {
  return apiGet<{ id: number; name: string }[]>("/catalog/store-categories/");
}

export interface StorePayload {
  name: string;
  category: number;
  phone: string;
  description: string;
  address: string;
  city: string;
}

/** Création de la boutique (elle reste « en attente » jusqu'à la validation). */
export function createStore(payload: StorePayload) {
  return apiPost<OwnStore>("/catalog/stores/", payload);
}

/** Modification ; une boutique refusée repart en examen. */
export function updateStore(id: string, payload: Partial<StorePayload>) {
  return apiPatch<OwnStore>(`/catalog/stores/${id}/`, payload);
}

export function uploadStoreImage(
  id: string,
  kind: "logo" | "banner",
  photo: { uri: string; fileName?: string | null; mimeType?: string | null },
) {
  const form = new FormData();
  form.append(kind, photoPart(photo, `${kind}.jpg`));
  return apiPost<OwnStore>(`/catalog/stores/${id}/${kind}/`, form);
}

/** Retrait du solde disponible vers Wave ou Orange Money (débité tout de suite, versé par Sunu Mall). */
export function requestPayout(amount: number, method: "wave" | "orange_money") {
  return apiPost<{ id: string; amount: string; status: string }>("/commissions/payouts/", { amount, method });
}

export interface SubscriptionPlan {
  id: number;
  code: string;
  name: string;
  price: string;
  billing_cycle: string;
  max_products: number | null;
  commission_rate: string;
  duration_days: number;
}

export async function listPlans() {
  const data = await apiGet<Paginated<SubscriptionPlan>>("/monetization/subscription-plans/");
  return data.results;
}

type PayMethod = "wave" | "orange_money";

/** Première souscription : renvoie le paiement à régler. */
export function subscribe(planId: number, method: PayMethod) {
  return apiPost<{ payment: { id: string } | null }>(`/monetization/subscription-plans/${planId}/subscribe/`, {
    payment_method: method,
  });
}

export function renewSubscription(method: PayMethod) {
  return apiPost<{ payment: { id: string } }>("/monetization/subscriptions/renew/", { payment_method: method });
}

export function changePlan(planCode: string, method: PayMethod) {
  return apiPost<{ payment: { id: string } }>("/monetization/subscriptions/change-plan/", {
    plan_code: planCode,
    payment_method: method,
  });
}

export interface SponsoredProduct {
  id: string;
  product: string;
  store: string;
  daily_budget: string;
  starts_at: string;
  ends_at: string;
  status: "active" | "inactive" | "expired";
}

export async function listPromotions() {
  const data = await apiGet<Paginated<SponsoredProduct> | SponsoredProduct[]>("/monetization/sponsored-products/");
  return Array.isArray(data) ? data : data.results;
}

/** Met un produit en avant sur l'accueil (section « Promotions ») entre deux dates. */
export function createPromotion(payload: { product: string; store: string; daily_budget: number; starts_at: string; ends_at: string }) {
  return apiPost<SponsoredProduct>("/monetization/sponsored-products/", { ...payload, status: "active" });
}

export function stopPromotion(id: string) {
  return apiPatch<SponsoredProduct>(`/monetization/sponsored-products/${id}/`, { status: "inactive" });
}
