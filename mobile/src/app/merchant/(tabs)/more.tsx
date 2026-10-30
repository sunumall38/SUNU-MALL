import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { mediaUrl } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { OwnStore } from "@/types";

type MenuItem = { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; onPress: () => void };

function storeBadge(store: OwnStore) {
  if (store.status === "active") return { label: "Active", color: colors.success, background: colors.successBg };
  if (store.status === "inactive") return { label: "En attente", color: colors.warning, background: colors.warningBg };
  return { label: store.rejection_reason ? "Refusée" : "Suspendue", color: colors.danger, background: "#FEE2E2" };
}

export default function MerchantMoreScreen() {
  const logout = useAuthStore((s) => s.logout);
  const store = useMerchantStore((s) => s.store) as OwnStore;
  const account = useMerchantStore((s) => s.account);
  const logo = mediaUrl(store.logo_url);
  const badge = storeBadge(store);

  const menu: MenuItem[] = [
    { icon: "wallet-outline", label: "Portefeuille", hint: "Solde et derniers mouvements", onPress: () => router.push("/merchant/wallet") },
    {
      icon: "ribbon-outline",
      label: "Mon abonnement",
      hint: account?.subscription ? account.subscription.plan_name : "Aucun abonnement actif",
      onPress: () => router.push("/merchant/subscription"),
    },
    { icon: "megaphone-outline", label: "Promotions", hint: "Mettre un produit en avant", onPress: () => router.push("/merchant/promotions") },
    { icon: "notifications-outline", label: "Notifications", onPress: () => router.push("/merchant/notifications") },
    { icon: "help-circle-outline", label: "Aide et support", onPress: () => router.push("/support") },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Plus</Text>

        <Pressable accessibilityRole="button" onPress={() => router.push("/merchant/store")} style={styles.storeCard}>
          <View style={styles.logo}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.logoImage} />
            ) : (
              <Ionicons name="storefront" size={26} color={colors.orange} />
            )}
          </View>
          <View style={styles.flex}>
            <Text style={styles.small}>Ma boutique</Text>
            <Text style={styles.storeName} numberOfLines={1}>
              {store.name}
            </Text>
            <Text style={styles.small}>Logo, bannière et informations</Text>
          </View>
          <Badge label={badge.label} color={badge.color} background={badge.background} />
        </Pressable>

        <View style={styles.menu}>
          {menu.map((item, index) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={item.onPress}
              style={({ pressed }) => [styles.menuRow, index > 0 && styles.menuDivider, pressed && styles.pressed]}
            >
              <Ionicons name={item.icon} size={21} color={colors.ink} />
              <View style={styles.flex}>
                <Text style={styles.menuLabel}>{item.label}</Text>
                {item.hint ? <Text style={styles.small}>{item.hint}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Button label="Se déconnecter" variant="secondary" onPress={logout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  storeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    ...shadow,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  logoImage: { width: "100%", height: "100%" },
  storeName: { fontSize: 17, fontWeight: "800", color: colors.ink },
  small: { fontSize: 12, color: colors.mutedForeground },
  menu: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, ...shadow },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  menuDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  menuLabel: { fontSize: 15, color: colors.ink },
});
