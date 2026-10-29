import { Stack } from "expo-router";
import { useEffect } from "react";
import { RoleGate } from "@/components/RoleGate";
import { useCartStore } from "@/store/cart";
import { colors } from "@/theme";

/** Espace client : réservé aux comptes dont l'écran d'arrivée est `/client`. */
export default function ClientLayout() {
  return (
    <RoleGate href="/client">
      <ClientStack />
    </RoleGate>
  );
}

function ClientStack() {
  const fetchCart = useCartStore((s) => s.fetch);
  const resetCart = useCartStore((s) => s.reset);

  // Panier chargé à l'entrée de l'espace (badge de l'onglet), vidé à la
  // sortie (déconnexion) pour ne jamais montrer celui d'un autre compte.
  useEffect(() => {
    void fetchCart();
    return resetCart;
  }, [fetchCart, resetCart]);

  return (
    <Stack screenOptions={{ headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.white } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: "", headerBackTitle: "Retour" }} />
    </Stack>
  );
}
