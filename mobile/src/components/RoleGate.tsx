import { Redirect } from "expo-router";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { roleHomeHref } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";

export function LoadingScreen() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.orange} />
    </View>
  );
}

/**
 * Laisse passer uniquement le compte dont l'écran d'arrivée est `href` ;
 * sinon renvoie vers la connexion ou vers le bon espace. Le serveur vérifie
 * de toute façon les droits sur chaque requête.
 */
export function RoleGate({ href, children }: { href: ReturnType<typeof roleHomeHref>; children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  if (!hasHydrated) return <LoadingScreen />;
  if (!user) return <Redirect href="/login" />;
  const home = roleHomeHref(user);
  if (home !== href) return <Redirect href={home} />;
  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
});
