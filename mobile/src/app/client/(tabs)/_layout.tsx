import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { cartItemCount, useCartStore } from "@/store/cart";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône d'onglet : la couleur fournie par la barre peut être nulle. */
function tabIcon(name: IconName) {
  return ({ color, size }: { color: unknown; size: number }) => (
    <Ionicons name={name} size={size} color={typeof color === "string" ? color : colors.mutedForeground} />
  );
}

export default function ClientTabsLayout() {
  const count = useCartStore((s) => cartItemCount(s.cart));

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.orange, tabBarInactiveTintColor: colors.mutedForeground }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Accueil",
          headerShown: false,
          tabBarIcon: tabIcon("home-outline"),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Panier",
          headerTitle: "Mon panier",
          tabBarIcon: tabIcon("cart-outline"),
          tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.orange },
        }}
      />
    </Tabs>
  );
}
