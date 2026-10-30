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
  created_at?: string;
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
  category?: number | null;
}

export interface Category {
  id: number;
  parent: number | null;
  name: string;
  image_url: string | null;
}

export interface Store {
  id: string;
  name: string;
  description: string;
  address: string;
  city: string;
  logo_url: string | null;
  banner_url: string | null;
  rating: number | null;
  review_count: number;
  category_detail: { id: number; name: string } | null;
  category_names: string[];
  is_verified_seller: boolean;
  latitude: string | null;
  longitude: string | null;
}

export interface WishlistItem {
  id: string;
  product: string;
  product_name: string;
  product_price: string;
  /** Première photo — absente tant que le backend n'est pas à jour. */
  product_image?: string | null;
}

export interface Wishlist {
  id: string;
  items: WishlistItem[];
}

export interface AppNotification {
  id: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CartItem {
  id: string;
  product_variant: string;
  /** Produit et première photo — absents tant que le backend n'est pas à jour. */
  product?: string;
  product_image?: string | null;
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

export interface Address {
  id: string;
  label: string;
  street: string;
  city: string;
  country: string;
  latitude: string | null;
  longitude: string | null;
}

export type DeliveryType = "standard" | "express" | "pickup";

export type PaymentMethodId = "wave" | "orange_money" | "card";

export type PaymentStatus = "pending" | "success" | "failed" | "refunded";

export interface CheckoutPayload {
  /** Fourni pour une commande d'une seule boutique ; omis pour une commande
   * multi-boutiques (le backend déduit les boutiques des articles). */
  store?: string;
  address: string;
  delivery_type: DeliveryType;
  payment_method: PaymentMethodId;
  items: { product_variant: string; quantity: number }[];
}

/** Réponse du checkout : commande (une boutique) ou commande globale (plusieurs). */
export interface CreatedOrder {
  id: string;
  total_amount: string;
  payment: { id: string; method: PaymentMethodId; status: PaymentStatus } | null;
}

export interface Payment {
  id: string;
  order: string | null;
  global_order: string | null;
  method: PaymentMethodId;
  amount: string;
  status: PaymentStatus;
}

export interface InitiatePaymentResult {
  sandbox: boolean;
  /** Page de paiement Wave / Orange Money — absente en mode test (sandbox). */
  checkout_url?: string;
  message: string;
}

export interface PaymentMethodsResult {
  sandbox: boolean;
  methods: { id: PaymentMethodId; label: string }[];
}

export type OrderStatus = "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled";

export interface OrderPayment {
  id: string;
  method: PaymentMethodId;
  status: PaymentStatus;
}

export interface OrderItem {
  id: string;
  product_variant: string;
  product_name: string;
  quantity: number;
  unit_price: string;
}

export interface OrderDelivery {
  id: string;
  reference: string;
  status: string;
  delivered_at: string | null;
}

/** Commande d'une boutique (ou sous-commande d'une commande globale). */
export interface Order {
  id: string;
  store_name: string;
  address_detail: Address | null;
  total_amount: string;
  delivery_fee: string;
  delivery_type?: DeliveryType;
  global_order: string | null;
  status: OrderStatus;
  can_be_cancelled: boolean;
  items: OrderItem[];
  delivery: OrderDelivery | null;
  payment: OrderPayment | null;
  /** La boutique a préparé le colis (backend à jour uniquement). */
  ready_at?: string | null;
  created_at: string;
}

/** Commande multi-boutiques : un paiement, une livraison, une sous-commande par boutique. */
export interface GlobalOrder {
  id: string;
  reference: string;
  address_detail: Address | null;
  delivery_type: DeliveryType;
  items_total: string;
  delivery_fee: string;
  total_amount: string;
  status: "pending" | "paid" | "cancelled";
  number_of_stores: number;
  orders: Order[];
  delivery: OrderDelivery | null;
  payment: OrderPayment | null;
  created_at: string;
}

// --- Espace commerçant ---

export type StoreStatus = "active" | "inactive" | "suspended";

/** Boutique vue par son propriétaire (statut de validation compris). */
export interface OwnStore extends Store {
  owner: string;
  phone: string;
  status: StoreStatus;
  rejection_reason: string;
}

export type KycStatus = "PENDING" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | "SUSPENDED" | "BLOCKED";

export interface SellerKyc {
  status: KycStatus;
  rejection_reason: string | null;
}

/** Abonnement commerçant et quota de produits. */
export interface SubscriptionState {
  has_active_subscription: boolean;
  /** null = illimité, 0 = création bloquée. */
  product_limit: number | null;
  product_count: number;
  products_remaining: number | null;
  is_unlimited: boolean;
  subscription: {
    status: string;
    plan_name: string;
    ends_at: string | null;
    days_left: number | null;
    in_grace: boolean;
  } | null;
}

/** Indicateurs des 30 derniers jours (commandes annulées exclues). */
export interface StoreSummary {
  revenue_30d: string;
  orders_30d: number;
  avg_order_value_30d: string;
  delivered_rate: number;
  avg_rating: number | null;
  review_count: number;
}

export interface SalesDay {
  id: string;
  date: string;
  total_sales: string;
  total_orders: number;
}

export interface WalletTransaction {
  id: string;
  type: "sale" | "refund" | "payout" | "release" | "adjustment";
  amount: string;
  description: string;
  created_at: string;
}

export interface SellerWallet {
  wallet: {
    available_balance: string;
    pending_balance: string;
    total_earned: string;
    total_withdrawn: string;
  };
  subscription: { status: string; can_sell: boolean } | null;
  recent_wallet_transactions: WalletTransaction[];
}

/** Commande vue par la boutique. */
export interface MerchantOrder extends Order {
  store: string;
  customer_name: string;
}
