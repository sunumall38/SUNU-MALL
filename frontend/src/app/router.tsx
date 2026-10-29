import type { ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";

import { AuthLayout } from "@/components/layout/AuthLayout";
import { MarketplaceLayout } from "@/components/layout/MarketplaceLayout";
import { CheckoutLayout } from "@/components/layout/CheckoutLayout";
import { MerchantLayout } from "@/components/layout/MerchantLayout";
import { DriverLayout } from "@/components/layout/DriverLayout";
import { PartnerLayout } from "@/components/layout/PartnerLayout";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { KycSessionWatcher } from "@/components/auth/KycSessionWatcher";
import { Spinner } from "@/components/ui/Spinner";
import { FEATURES } from "@/lib/features";








/**
 * Chaque écran est chargé à la demande (un fichier JS par page) : le premier
 * affichage ne télécharge que la page visitée, pas toute l'application.
 */
function page(load: () => Promise<{ default: ComponentType }>) {
  return async () => {
    try {
      const module = await load();
      try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      } catch {
        /* stockage indisponible : sans conséquence */
      }
      return { Component: module.default };
    } catch (error) {
      // Après une mise en production, les anciens fichiers JS n'existent
      // plus : on recharge une fois la page pour récupérer la nouvelle
      // version au lieu d'afficher une erreur.
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      } catch {
        alreadyReloaded = true;
      }
      if (!alreadyReloaded) window.location.reload();
      throw error;
    }
  };
}

const CHUNK_RELOAD_KEY = "sunumall:chunk-reload";


export const router = createBrowserRouter([
  {
    element: <KycSessionWatcher />,
    hydrateFallbackElement: <Spinner label="Chargement…" />,
    children: [
      { path: "/", element: <Navigate to="/home" replace /> },

  {
    element: <AuthLayout />,
    children: [
      { path: "/splash", lazy: page(() => import("@/pages/splash")) },
      { path: "/login", lazy: page(() => import("@/pages/login")) },
      { path: "/register-client", lazy: page(() => import("@/pages/register-client")) },
      { path: "/register-merchant", lazy: page(() => import("@/pages/register-merchant")) },
      { path: "/verify-email", lazy: page(() => import("@/pages/verify-email")) },
      { path: "/guest-login", lazy: page(() => import("@/pages/guest-login")) },
      { path: "/mot-de-passe-oublie", lazy: page(() => import("@/pages/forgot-password")) },
      { path: "/reinitialiser-mot-de-passe", lazy: page(() => import("@/pages/reset-password")) },
      // Ancienne page de connexion livreur : une seule page de connexion pour tous les rôles.
      { path: "/driver-login", element: <Navigate to="/login" replace /> },
    ],
  },

  {
    element: <MarketplaceLayout />,
    children: [
      { path: "/home", lazy: page(() => import("@/pages/home")) },
      { path: "/search", lazy: page(() => import("@/pages/search")) },
      { path: "/boutiques", lazy: page(() => import("@/pages/boutiques")) },
      { path: "/boutiques/:slug", lazy: page(() => import("@/pages/boutique-detail")) },
      { path: "/product/:id", lazy: page(() => import("@/pages/product-detail")) },
      { path: "/category", lazy: page(() => import("@/pages/category")) },
      { path: "/category/:slug", lazy: page(() => import("@/pages/category-detail")) },
      { path: "/wishlist", lazy: page(() => import("@/pages/wishlist")) },
      { path: "/recently-viewed", lazy: page(() => import("@/pages/recently-viewed")) },
      { path: "/notifications", lazy: page(() => import("@/pages/notifications")) },
      { path: "/contact", lazy: page(() => import("@/pages/contact")) },
      { path: "/mentions-legales", lazy: page(() => import("@/pages/legal/mentions-legales")) },
      { path: "/politique-de-confidentialite", lazy: page(() => import("@/pages/legal/politique-confidentialite")) },
      { path: "/conditions-utilisation", lazy: page(() => import("@/pages/legal/conditions-utilisation")) },
    ],
  },

  {
    element: <CheckoutLayout />,
    children: [
      { path: "/cart", lazy: page(() => import("@/pages/cart")) },
      { path: "/checkout-address", lazy: page(() => import("@/pages/checkout-address")) },
      { path: "/checkout-delivery", lazy: page(() => import("@/pages/checkout-delivery")) },
      { path: "/checkout-payment", lazy: page(() => import("@/pages/checkout-payment")) },
      { path: "/order-confirmed", lazy: page(() => import("@/pages/order-confirmed")) },
      { path: "/paiement/retour", lazy: page(() => import("@/pages/payment-return")) },
      { path: "/orders", lazy: page(() => import("@/pages/orders")) },
      { path: "/tracking", lazy: page(() => import("@/pages/tracking")) },
      { path: "/delivery-confirm", lazy: page(() => import("@/pages/delivery-confirm")) },
    ],
  },

  {
    element: <MerchantLayout />,
    children: [
      { path: "/merchant", lazy: page(() => import("@/pages/merchant")) },
      { path: "/create-shop", lazy: page(() => import("@/pages/create-shop")) },
      { path: "/store-settings", lazy: page(() => import("@/pages/store-settings")) },
      { path: "/add-product", lazy: page(() => import("@/pages/add-product")) },
      { path: "/catalog", lazy: page(() => import("@/pages/catalog")) },
      { path: "/subscriptions", lazy: page(() => import("@/pages/subscriptions")) },
      { path: "/offers", lazy: page(() => import("@/pages/offers")) },
      { path: "/promotions", lazy: page(() => import("@/pages/promotions")) },
      { path: "/support", lazy: page(() => import("@/pages/support")) },
      { path: "/analytics", lazy: page(() => import("@/pages/analytics")) },
      FEATURES.liveSales
        ? { path: "/live-sales", lazy: page(() => import("@/pages/live-sales")) }
        : { path: "/live-sales", element: <Navigate to="/merchant" replace /> },
      { path: "/order-detail", lazy: page(() => import("@/pages/order-detail")) },
      { path: "/merchant-wallet", lazy: page(() => import("@/pages/seller-wallet")) },
      { path: "/merchant-payouts", lazy: page(() => import("@/pages/seller-payouts")) },
      { path: "/merchant-notifications", lazy: page(() => import("@/pages/notifications")) },
    ],
  },

  {
    element: <DriverLayout />,
    children: [
      { path: "/driver-dashboard", lazy: page(() => import("@/pages/driver-dashboard")) },
      { path: "/driver-delivery", lazy: page(() => import("@/pages/driver-delivery")) },
      { path: "/driver-profile", lazy: page(() => import("@/pages/driver-profile")) },
      { path: "/driver-password-change", lazy: page(() => import("@/pages/driver-password-change")) },
      { path: "/driver-notifications", lazy: page(() => import("@/pages/notifications")) },
    ],
  },

  {
    element: <PartnerLayout />,
    children: [
      { path: "/partner", lazy: page(() => import("@/pages/partner")) },
      { path: "/partner-deliveries", lazy: page(() => import("@/pages/partner-deliveries")) },
      { path: "/partner-delivery", lazy: page(() => import("@/pages/partner-delivery")) },
      { path: "/partner-drivers", lazy: page(() => import("@/pages/partner-drivers")) },
      { path: "/partner-zones", lazy: page(() => import("@/pages/partner-zones")) },
      { path: "/partner-finances", lazy: page(() => import("@/pages/partner-finances")) },
      { path: "/partner-profile", lazy: page(() => import("@/pages/partner-profile")) },
      { path: "/partner-notifications", lazy: page(() => import("@/pages/notifications")) },
      { path: "/partner-password-change", lazy: page(() => import("@/pages/driver-password-change")) },
    ],
  },

  {
    element: <AdminLayout />,
    children: [
      { path: "/admin", lazy: page(() => import("@/pages/admin")) },
      { path: "/admin-search", lazy: page(() => import("@/pages/admin-search")) },
      { path: "/admin-users", lazy: page(() => import("@/pages/admin-users")) },
      { path: "/admin-users/:id", lazy: page(() => import("@/pages/admin-user-detail")) },
      { path: "/admin-sellers", lazy: page(() => import("@/pages/admin-sellers")) },
      { path: "/admin-sellers/:id", lazy: page(() => import("@/pages/admin-seller-detail")) },
      { path: "/admin-shops", lazy: page(() => import("@/pages/admin-shops")) },
      { path: "/admin-products", lazy: page(() => import("@/pages/admin-products")) },
      { path: "/admin-categories", lazy: page(() => import("@/pages/admin-categories")) },
      { path: "/admin-orders", lazy: page(() => import("@/pages/admin-orders")) },
      { path: "/admin-order-detail", lazy: page(() => import("@/pages/order-detail")) },
      { path: "/admin-payments", lazy: page(() => import("@/pages/admin-payments")) },
      { path: "/admin-subscriptions", lazy: page(() => import("@/pages/admin-subscriptions")) },
      { path: "/admin-refunds", lazy: page(() => import("@/pages/admin-refunds")) },
      { path: "/admin-kyc-sellers", lazy: page(() => import("@/pages/admin-kyc-sellers")) },
      { path: "/admin-kyc-drivers", lazy: page(() => import("@/pages/admin-kyc-drivers")) },
      { path: "/admin-drivers", lazy: page(() => import("@/pages/admin-drivers")) },
      { path: "/admin-deliveries", lazy: page(() => import("@/pages/admin-deliveries")) },
      { path: "/admin-partners", lazy: page(() => import("@/pages/admin-partners")) },
      { path: "/admin-finance", lazy: page(() => import("@/pages/admin-finance")) },
      { path: "/admin-complaints", lazy: page(() => import("@/pages/admin-complaints")) },
      { path: "/admin-complaints/:id", lazy: page(() => import("@/pages/admin-complaint-detail")) },
      { path: "/admin-support", lazy: page(() => import("@/pages/admin-support")) },
      { path: "/admin-notifications", lazy: page(() => import("@/pages/admin-notifications")) },
      { path: "/admin-managers", lazy: page(() => import("@/pages/admin-managers")) },
      { path: "/admin-security", lazy: page(() => import("@/pages/admin-security")) },
      { path: "/admin-analytics", lazy: page(() => import("@/pages/admin-analytics")) },
      { path: "/admin-reports", lazy: page(() => import("@/pages/admin-reports")) },
      { path: "/admin-monitoring", lazy: page(() => import("@/pages/admin-monitoring")) },
      { path: "/admin-incidents", lazy: page(() => import("@/pages/admin-incidents")) },
      { path: "/admin-incidents/:id", lazy: page(() => import("@/pages/admin-incident-detail")) },
      { path: "/admin-logs", lazy: page(() => import("@/pages/admin-logs")) },
      { path: "/admin-deployments", lazy: page(() => import("@/pages/admin-deployments")) },
      { path: "/admin-feature-flags", lazy: page(() => import("@/pages/admin-feature-flags")) },
      { path: "/admin-maintenance", lazy: page(() => import("@/pages/admin-maintenance")) },
      { path: "/admin-backups", lazy: page(() => import("@/pages/admin-backups")) },
      { path: "/admin-emergency", lazy: page(() => import("@/pages/admin-emergency")) },
    ],
  },

  { path: "*", element: <Navigate to="/home" replace /> },
    ],
  },
]);
