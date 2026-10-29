import { apiGet } from "@/lib/api";
import type { Paginated, Product, ProductVariant } from "@/types";

export function listProducts(page = 1) {
  return apiGet<Paginated<Product>>(`/catalog/products/?page=${page}`);
}

export function getProduct(id: string) {
  return apiGet<Product>(`/catalog/products/${id}/`);
}

/**
 * Nom lisible d'une variante : ses attributs (« M · Rouge »), sinon
 * « Option 2 ». Le SKU, généré automatiquement, n'est pas montré au client.
 */
export function variantLabel(variant: ProductVariant, index: number) {
  const values = Object.values(variant.attributes ?? {}).filter(Boolean);
  return values.length ? values.join(" · ") : `Option ${index + 1}`;
}
