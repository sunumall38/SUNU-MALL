import { Tabs } from "expo-router";
import { tabIcon } from "@/components/TabIcon";
import { colors } from "@/theme";

export default function MerchantTabsLayout() {
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
      <Tabs.Screen name="orders" options={{ title: "Commandes", tabBarIcon: tabIcon("receipt", "receipt-outline") }} />
      <Tabs.Screen name="products" options={{ title: "Produits", tabBarIcon: tabIcon("cube", "cube-outline") }} />
      <Tabs.Screen name="stats" options={{ title: "Statistiques", tabBarIcon: tabIcon("bar-chart", "bar-chart-outline") }} />
      <Tabs.Screen name="more" options={{ title: "Plus", tabBarIcon: tabIcon("menu", "menu-outline") }} />
    </Tabs>
  );
}
