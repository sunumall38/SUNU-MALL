import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { router, type Href } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { LoginPrompt } from "@/components/EmptyState";
import { Logo } from "@/components/Logo";
import { SITE_URL } from "@/lib/config";
import { useAuthStore } from "@/store/auth";
import { colors, radius, shadow } from "@/theme";

type MenuItem = { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };

const go = (href: Href) => () => router.push(href);

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.guestLogo}>
          <Logo size={30} />
        </View>
        <LoginPrompt
          icon="person-outline"
          title="Votre compte"
          text="Connectez-vous pour retrouver vos commandes, vos adresses et vos favoris."
        />
      </SafeAreaView>
    );
  }

  const year = user.created_at ? new Date(user.created_at).getFullYear() : null;
  const initials = `${user.first_name.charAt(0)}${user.last_name.charAt(0)}`.toUpperCase() || "?";

  const menu: MenuItem[] = [
    { icon: "receipt-outline", label: "Mes commandes", onPress: () => router.navigate("/client/orders") },
    { icon: "location-outline", label: "Mes adresses", onPress: go("/client/addresses") },
    { icon: "heart-outline", label: "Mes favoris", onPress: go("/client/favorites") },
    { icon: "notifications-outline", label: "Notifications", onPress: go("/client/notifications") },
    { icon: "storefront-outline", label: "Boutiques", onPress: go("/client/shops") },
    { icon: "help-circle-outline", label: "Aide", onPress: () => Linking.openURL(`${SITE_URL}/contact`) },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.hello}>Bonjour, {user.first_name || "à vous"} 👋</Text>
            {year ? <Text style={styles.since}>Membre depuis {year}</Text> : null}
          </View>
        </View>

        <View style={styles.menu}>
          {menu.map((item, index) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={item.onPress}
              style={({ pressed }) => [styles.menuRow, index > 0 && styles.menuDivider, pressed && styles.pressed]}
            >
              <Ionicons name={item.icon} size={21} color={colors.ink} />
              <Text style={styles.menuLabel}>{item.label}</Text>
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
  guestLogo: { paddingHorizontal: 16, paddingTop: 8 },
  content: { padding: 16, gap: 20 },
  identity: { flexDirection: "row", alignItems: "center", gap: 16, paddingVertical: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.peach,
  },
  initials: { fontSize: 24, fontWeight: "800", color: colors.orangeDark },
  hello: { fontSize: 20, fontWeight: "800", color: colors.ink },
  since: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  menu: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, ...shadow },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15 },
  menuDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.6 },
  menuLabel: { flex: 1, fontSize: 15, color: colors.ink },
});
