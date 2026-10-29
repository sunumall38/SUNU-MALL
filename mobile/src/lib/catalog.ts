import { apiGet } from "@/lib/api";
import type { Category, Paginated, Product, ProductVariant, Store } from "@/types";

/** Le catalogue est public : il se parcourt sans compte. */
const PUBLIC = { auth: false } as const;

export function listProducts(params: { page?: number; search?: string; category?: number; store?: string } = {}) {
  const qs = new URLSearchParams({ page: String(params.page ?? 1) });
  if (params.search) qs.set("search", params.search);
  if (params.category) qs.set("category", String(params.category));
  if (params.store) qs.set("store", params.store);
  return apiGet<Paginated<Product>>(`/catalog/products/?${qs.toString()}`, PUBLIC);
}

export function getProduct(id: string) {
  return apiGet<Product>(`/catalog/products/${id}/`, PUBLIC);
}

export function listBestSellers() {
  return apiGet<Product[]>("/catalog/products/best_sellers/", PUBLIC);
}

/** Produits mis en avant par les boutiques (section « Promotions » de l'accueil). */
export function listSponsoredProducts() {
  return apiGet<Product[]>("/catalog/products/sponsored/", PUBLIC);
}

/** Toutes les catégories (l'API les pagine par 20). */
export async function listCategories() {
  const all: Category[] = [];
  for (let page = 1; page <= 10; page++) {
    const data = await apiGet<Paginated<Category>>(`/catalog/categories/?page=${page}`, PUBLIC);
    all.push(...data.results);
    if (!data.next) break;
  }
  return all;
}

export function listStores(params: { page?: number; search?: string; ordering?: string } = {}) {
  const qs = new URLSearchParams({ page: String(params.page ?? 1) });
  if (params.search) qs.set("search", params.search);
  if (params.ordering) qs.set("ordering", params.ordering);
  return apiGet<Paginated<Store>>(`/catalog/stores/?${qs.toString()}`, PUBLIC);
}

export function getStore(id: string) {
  return apiGet<Store>(`/catalog/stores/${id}/`, PUBLIC);
}

/**
 * Nom lisible d'une variante : ses attributs (« M · Rouge »), sinon
 * « Option 2 ». Le SKU, généré automatiquement, n'est pas montré au client.
 */
export function variantLabel(variant: ProductVariant, index: number) {
  const values = Object.values(variant.attributes ?? {}).filter(Boolean);
  return values.length ? values.join(" · ") : `Option ${index + 1}`;
}

/** Prix affiché d'un produit : celui de sa première variante disponible, sinon le prix de base. */
export function displayPrice(product: Product) {
  const variant = product.variants.find((v) => v.is_available) ?? product.variants[0];
  return variant?.price ?? product.base_price;
}

/** Première photo du produit, ou null. */
export function productImage(product: Product) {
  return product.images[0]?.url ?? null;
}
