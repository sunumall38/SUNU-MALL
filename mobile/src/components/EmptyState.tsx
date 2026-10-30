import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { colors } from "@/theme";

export function EmptyState({
  icon,
  title,
  text,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={36} color={colors.orange} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

/** Onglet réservé aux comptes (panier, commandes, profil) vu par un visiteur. */
export function LoginPrompt({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  return (
    <EmptyState icon={icon} title={title} text={text}>
      <Button label="Se connecter" onPress={() => router.push("/login")} />
      <Button label="Créer un compte" variant="secondary" onPress={() => router.push("/register")} />
    </EmptyState>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 32 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
  text: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 10, marginTop: 10 },
});
