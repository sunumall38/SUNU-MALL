/**
 * Types de l'API, repris de `frontend/src/types/index.ts`.
 * À remplacer par le paquet partagé (`packages/shared`) quand il existera.
 */
export type Role =
  | "admin"
  | "super_admin"
  | "admin_kyc"
  | "admin_support"
  | "admin_finance"
  | "admin_marketplace"
  | "admin_delivery"
  | "merchant"
  | "client"
  | "driver"
  | "partner";

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  roles: Role[];
  is_verified: boolean;
  has_password: boolean;
  /** Compte créé par un tiers (livreur, partenaire) : mot de passe provisoire à changer. */
  must_change_password?: boolean;
}

export interface AuthResponse {
  user: AuthUser;
  access: string | null;
  refresh: string | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ProductImage {
  id: string;
  url: string | null;
  position: number;
}

export interface ProductVariant {
  id: string;
  product: string;
  sku: string;
  attributes: Record<string, string>;
  price: string;
  is_available: boolean;
  /** Stock disponible. */
  quantity: number;
}

export interface Product {
  id: string;
  store: string;
  store_name: string;
  brand: string | null;
  name: string;
  description: string;
  base_price: string;
  status: "draft" | "active" | "inactive";
  images: ProductImage[];
  variants: ProductVariant[];
  store_is_verified?: boolean;
}

export interface CartItem {
  id: string;
  product_variant: string;
  product_name: string;
  unit_price: string;
  quantity: number;
  subtotal: number;
  store: string;
}

export interface Cart {
  id: string;
  items: CartItem[];
  total_price: number;
}
