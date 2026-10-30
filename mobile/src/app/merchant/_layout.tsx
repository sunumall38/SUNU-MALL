import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { KycForm } from "@/components/KycForm";
import { Logo } from "@/components/Logo";
import { RoleGate } from "@/components/RoleGate";
import { StoreForm } from "@/components/StoreForm";
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
 * Comme sur le site : la boutique d'abord, puis la pièce d'identité. Les deux
 * étapes se font ici ; ensuite l'espace s'ouvre, sans attendre la validation.
 */
function MerchantGate() {
  const userId = useAuthStore((s) => s.user?.id);
  const userPhone = useAuthStore((s) => s.user?.phone ?? "");
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

  const reload = () => {
    if (userId) void load(userId);
  };

  if (kyc?.status === "SUSPENDED" || kyc?.status === "BLOCKED") {
    return (
      <Blocked
        icon="id-card-outline"
        title="Compte vendeur restreint"
        text="Votre compte vendeur est restreint. Contactez le support Sunu Mall."
        action="Contacter le support"
        onAction={() => router.push("/support")}
        onLogout={logout}
      />
    );
  }

  if (!store) {
    return (
      <Onboarding
        step="Étape 1 sur 2 — votre boutique"
        text="Présentez votre boutique. Vous enverrez ensuite une pièce d'identité : Sunu Mall vérifie les deux ensemble."
        onLogout={logout}
      >
        <StoreForm defaultPhone={userPhone} submitLabel="Créer ma boutique" onSaved={reload} />
      </Onboarding>
    );
  }

  if (!kycAllowsAccess(kyc)) {
    return (
      <Onboarding
        step="Étape 2 sur 2 — votre identité"
        text={
          kyc?.status === "REJECTED"
            ? `Vos pièces ont été refusées${kyc.rejection_reason ? ` : ${kyc.rejection_reason}` : ""}. Envoyez-en de nouvelles.`
            : "Dernière étape : envoyez une pièce d'identité. Sunu Mall la vérifie avec votre boutique."
        }
        onLogout={logout}
      >
        <KycForm onDone={reload} />
      </Onboarding>
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
      <Stack.Screen name="store" options={{ title: "Ma boutique" }} />
      <Stack.Screen name="subscription" options={{ title: "Mon abonnement" }} />
      <Stack.Screen name="payment/[id]" options={{ title: "Paiement" }} />
      <Stack.Screen name="promotions" options={{ title: "Promotions" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
    </Stack>
  );
}

/** Étapes d'ouverture de l'espace vendeur, avec leur formulaire. */
function Onboarding({
  step,
  text,
  onLogout,
  children,
}: {
  step: string;
  text: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.onboarding} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Logo size={48} stacked />
            <Text style={styles.space}>Espace boutique</Text>
          </View>
          <Text style={styles.title}>{step}</Text>
          <Text style={styles.text}>{text}</Text>
          {children}
          <Text style={styles.note}>
            Pendant l'examen, vous pourrez préparer vos produits : ils seront mis en ligne dès la validation, et votre
            essai gratuit de 30 jours commencera ce jour-là.
          </Text>
          <Button label="Se déconnecter" variant="ghost" onPress={onLogout} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Blocked({
  icon,
  title,
  text,
  action,
  onAction,
  onLogout,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  action: string;
  onAction: () => void;
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
        <Button label={action} onPress={onAction} />
        <Button label="Se déconnecter" variant="ghost" onPress={onLogout} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  onboarding: { padding: 24, gap: 14 },
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
  note: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground, textAlign: "center" },
});
