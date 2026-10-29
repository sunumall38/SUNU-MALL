import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";
import { cartItemCount, useCartStore } from "@/store/cart";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône d'onglet : pleine quand l'onglet est actif. La couleur fournie peut être nulle. */
function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => (
    <Ionicons
      name={focused ? active : inactive}
      size={size}
      color={typeof color === "string" ? color : colors.mutedForeground}
    />
  );
}

export default function ClientTabsLayout() {
  const count = useCartStore((s) => cartItemCount(s.cart));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.orange,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Accueil", tabBarIcon: tabIcon("home", "home-outline") }} />
      <Tabs.Screen name="search" options={{ title: "Recherche", tabBarIcon: tabIcon("search", "search-outline") }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Panier",
          tabBarIcon: tabIcon("cart", "cart-outline"),
          tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.orange },
        }}
      />
      <Tabs.Screen name="orders" options={{ title: "Commandes", tabBarIcon: tabIcon("receipt", "receipt-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: tabIcon("person", "person-outline") }} />
    </Tabs>
  );
}
