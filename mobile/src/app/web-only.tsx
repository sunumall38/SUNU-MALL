import * as Linking from "expo-linking";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { SITE_URL } from "@/lib/config";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";
import type { Role } from "@/types";

/** Espace d'arrivée sur le site, selon le rôle (même ordre que `frontend/src/lib/roles.ts`). */
function siteSpace(roles: Role[]) {
  if (roles.some((role) => role === "admin" || role.startsWith("admin_") || role === "super_admin")) {
    return { label: "d'administration", path: "/admin" };
  }
  if (roles.includes("merchant")) return { label: "commerçant", path: "/merchant" };
  if (roles.includes("partner")) return { label: "partenaire", path: "/partner" };
  return { label: "personnel", path: "/home" };
}

/** Commerçants, partenaires et admins : leur espace n'existe pas encore dans l'appli. */
export default function WebOnlyScreen() {
  return (
    <RoleGate href="/web-only">
      <WebOnlyContent />
    </RoleGate>
  );
}

function WebOnlyContent() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const space = siteSpace(user?.roles ?? []);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Votre espace est sur le site</Text>
        <Text style={styles.text}>
          L'espace {space.label} de Sunu Mall se gère depuis le site web. L'appli est pour l'instant réservée aux
          clients et aux livreurs.
        </Text>
        <Button label="Ouvrir le site" onPress={() => Linking.openURL(`${SITE_URL}${space.path}`)} />
        <Button label="Se déconnecter" variant="ghost" onPress={() => void logout()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  text: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground },
});
