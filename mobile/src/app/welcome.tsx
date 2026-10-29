import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { roleHomeHref } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: "bicycle-outline", label: "Livraison\nrapide" },
  { icon: "shield-checkmark-outline", label: "Paiement\nsécurisé" },
  { icon: "headset-outline", label: "Support\n24/7" },
];

/** Écran d'accueil du visiteur : parcourir le catalogue sans compte, ou se connecter. */
export default function WelcomeScreen() {
  const user = useAuthStore((s) => s.user);
  if (user) return <Redirect href={roleHomeHref(user)} />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logo}>
          <Logo size={88} stacked />
        </View>

        <Text style={styles.title}>
          Tout le Sénégal{"\n"}
          <Text style={styles.titleAccent}>dans une seule</Text>
          {"\n"}plateforme
        </Text>
        <Text style={styles.subtitle}>
          Achetez en toute confiance parmi des milliers de boutiques et faites-vous livrer partout.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature.icon} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={feature.icon} size={22} color={colors.orange} />
              </View>
              <Text style={styles.featureLabel}>{feature.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Commencer" onPress={() => router.replace("/client")} />
          <Pressable accessibilityRole="button" onPress={() => router.push("/login")} style={styles.login} hitSlop={8}>
            <Text style={styles.loginText}>Se connecter</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 22 },
  logo: { alignItems: "center", marginBottom: 12 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "800", color: colors.navy },
  titleAccent: { color: colors.orange },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground },
  features: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  feature: { flex: 1, alignItems: "center", gap: 8 },
  featureIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  featureLabel: { fontSize: 13, lineHeight: 17, color: colors.ink, textAlign: "center" },
  actions: { gap: 8, marginTop: 16 },
  login: { alignItems: "center", paddingVertical: 10 },
  loginText: { fontSize: 15, fontWeight: "600", color: colors.navy },
});
