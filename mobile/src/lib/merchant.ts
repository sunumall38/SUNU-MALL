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
