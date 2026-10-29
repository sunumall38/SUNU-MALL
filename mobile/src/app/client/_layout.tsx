import { Redirect, Stack } from "expo-router";
import { useEffect } from "react";
import { LoadingScreen } from "@/components/RoleGate";
import { roleHomeHref } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { useWishlistStore } from "@/store/wishlist";
import { colors } from "@/theme";

/**
 * Espace client : ouvert aux visiteurs (catalogue, recherche, fiches) ; le
 * panier, les commandes et le profil demandent un compte client. Un compte
 * d'un autre rôle est renvoyé vers son propre espace.
 */
export default function ClientLayout() {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  if (!hasHydrated) return <LoadingScreen />;
  if (user && roleHomeHref(user) !== "/client") return <Redirect href={roleHomeHref(user)} />;
  return <ClientStack userId={user?.id ?? null} />;
}

function ClientStack({ userId }: { userId: string | null }) {
  const fetchCart = useCartStore((s) => s.fetch);
  const resetCart = useCartStore((s) => s.reset);
  const fetchWishlist = useWishlistStore((s) => s.fetch);
  const resetWishlist = useWishlistStore((s) => s.reset);

  // Panier et favoris du compte connecté (badge, cœurs) ; vidés à la
  // déconnexion pour ne jamais montrer ceux d'un autre compte.
  useEffect(() => {
    if (!userId) return;
    void fetchCart();
    void fetchWishlist();
    return () => {
      resetCart();
      resetWishlist();
    };
  }, [userId, fetchCart, resetCart, fetchWishlist, resetWishlist]);

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerBackTitle: "Retour",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="checkout" options={{ title: "Livraison et paiement" }} />
      <Stack.Screen name="addresses" options={{ title: "Mes adresses" }} />
      <Stack.Screen name="payment/[id]" options={{ title: "Paiement" }} />
      <Stack.Screen name="orders/[id]" options={{ title: "Ma commande" }} />
      <Stack.Screen name="favorites" options={{ title: "Mes favoris" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="shops" options={{ title: "Boutiques" }} />
      <Stack.Screen name="shop/[id]" options={{ title: "" }} />
      <Stack.Screen name="category/[id]" options={{ title: "" }} />
    </Stack>
  );
}
