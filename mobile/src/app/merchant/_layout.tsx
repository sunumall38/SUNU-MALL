import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { RoleGate } from "@/components/RoleGate";
import { SITE_URL } from "@/lib/config";
import { useAuthStore } from "@/store/auth";
import { kycAllowsAccess, useMerchantStore } from "@/store/merchant";
import { colors } from "@/theme";

/** Espace vendeur : réservé aux comptes commerçants. */
export default function MerchantLayout() {
  return (
    <RoleGate href="/merchant">
      <MerchantGate />
    </RoleGate>
  );
}

/**
 * Comme sur le site : l'identité doit avoir été envoyée, puis la boutique
 * créée. Ces deux étapes (pièces d'identité, formulaire boutique) se font
 * sur le site pour l'instant.
 */
function MerchantGate() {
  const userId = useAuthStore((s) => s.user?.id);
  const logout = useAuthStore((s) => s.logout);
  const { loaded, error, store, kyc, load, reset } = useMerchantStore();

  useEffect(() => {
    if (!userId) return;
    void load(userId);
    return reset;
  }, [userId, load, reset]);

  if (!loaded) {
    return (
      <SafeAreaView style={styles.center}>
        {error ? (
          <>
            <Text style={styles.text}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={() => userId && load(userId)} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} />
        )}
      </SafeAreaView>
    );
  }

  if (!kycAllowsAccess(kyc)) {
    const restricted = kyc?.status === "SUSPENDED" || kyc?.status === "BLOCKED";
    return (
      <Blocked
        icon="id-card-outline"
        title={restricted ? "Compte vendeur restreint" : "Étape 1 sur 2 — votre identité"}
        text={
          restricted
            ? "Votre compte vendeur est restreint. Contactez le support Sunu Mall."
            : kyc?.status === "REJECTED"
              ? `Vos pièces ont été refusées${kyc.rejection_reason ? ` : ${kyc.rejection_reason}` : ""}. Renvoyez-les depuis le site.`
              : "Envoyez votre pièce d'identité depuis le site pour ouvrir votre espace boutique."
        }
        action={restricted ? "Contacter le support" : "Envoyer mes pièces sur le site"}
        url={restricted ? `${SITE_URL}/contact` : `${SITE_URL}/merchant`}
        onLogout={logout}
      />
    );
  }

  if (!store) {
    return (
      <Blocked
        icon="storefront-outline"
        title="Étape 2 sur 2 — votre boutique"
        text="Vous n'avez pas encore de boutique. Créez-la sur le site : nom, catégorie, adresse et téléphone."
        action="Créer ma boutique sur le site"
        url={`${SITE_URL}/create-shop`}
        onLogout={logout}
      />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerBackTitle: "Retour",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="order/[id]" options={{ title: "Commande" }} />
      <Stack.Screen name="product/new" options={{ title: "Ajouter un produit" }} />
      <Stack.Screen name="product/[id]" options={{ title: "Produit" }} />
      <Stack.Screen name="wallet" options={{ title: "Portefeuille" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
    </Stack>
  );
}

function Blocked({
  icon,
  title,
  text,
  action,
  url,
  onLogout,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  action: string;
  url: string;
  onLogout: () => void;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.logo}>
          <Logo size={64} stacked />
          <Text style={styles.space}>Espace boutique</Text>
        </View>
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={34} color={colors.orange} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
        <Button label={action} onPress={() => Linking.openURL(url)} />
        <Button label="Se déconnecter" variant="ghost" onPress={onLogout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 14 },
  logo: { alignItems: "center", gap: 4, marginBottom: 16 },
  space: { fontSize: 18, fontWeight: "700", color: colors.navy },
  iconCircle: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, textAlign: "center" },
  text: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground, textAlign: "center" },
});
