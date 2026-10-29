import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { LoadingScreen } from "@/components/RoleGate";
import { TextField } from "@/components/TextField";
import { ApiError, apiErrorMessage } from "@/lib/api";
import * as authApi from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { normalizeSenegalPhone, SENEGAL_PHONE_ERROR, SENEGAL_PHONE_EXAMPLE } from "@/lib/phone";
import { roleHomeHref } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";

export default function LoginScreen() {
  const user = useAuthStore((s) => s.user);
  const loginSuccess = useAuthStore((s) => s.loginSuccess);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ phone?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [unverifiedPhone, setUnverifiedPhone] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <LeaveLogin home={roleHomeHref(user)} />;

  async function submit() {
    const normalized = normalizeSenegalPhone(phone);
    const nextErrors = {
      phone: normalized ? undefined : SENEGAL_PHONE_ERROR,
      password: password ? undefined : "Mot de passe requis",
    };
    setErrors(nextErrors);
    setServerError(null);
    setUnverifiedPhone(null);
    if (!normalized || !password) return;

    setSubmitting(true);
    try {
      // La redirection vers l'espace du compte se fait au rendu suivant.
      await loginSuccess(await authApi.login(normalized, password));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setUnverifiedPhone(normalized);
      else setServerError(err instanceof ApiError ? apiErrorMessage(err, "Identifiants incorrects.") : apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {router.canGoBack() ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Retour" onPress={() => router.back()} hitSlop={12} style={styles.back}>
              <Ionicons name="arrow-back" size={24} color={colors.ink} />
            </Pressable>
          ) : null}
          <View style={styles.header}>
            <Logo size={64} stacked />
            <Text style={styles.title}>Connexion</Text>
            <Text style={styles.subtitle}>Accédez à votre compte Sunu Mall.</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Numéro de téléphone"
              prefix="+221"
              placeholder={SENEGAL_PHONE_EXAMPLE}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={phone}
              onChangeText={setPhone}
              error={errors.phone}
              hint="Les 9 chiffres de votre numéro, sans l'indicatif."
            />
            <TextField
              label="Mot de passe"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Pressable onPress={() => Linking.openURL(`${SITE_URL}/mot-de-passe-oublie`)} style={styles.forgot}>
              <Text style={styles.link}>Mot de passe oublié ?</Text>
            </Pressable>

            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
            {unverifiedPhone ? <ResendVerification phone={unverifiedPhone} /> : null}

            <Button label="Se connecter" onPress={submit} loading={submitting} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Pas encore de compte ?</Text>
            <Pressable onPress={() => Linking.openURL(`${SITE_URL}/register-client`)}>
              <Text style={styles.link}>Créer un compte sur le site</Text>
            </Pressable>
            <Text style={styles.footerNote}>
              Livreurs : connectez-vous avec le numéro et le mot de passe fournis par Sunu Mall ou votre entreprise.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Connecté : retour à l'écran d'où vient le visiteur (panier, fiche
 * produit…), qui s'adapte au compte ; sinon, l'espace du compte.
 */
function LeaveLogin({ home }: { home: ReturnType<typeof roleHomeHref> }) {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace(home);
  }, [home]);
  return <LoadingScreen />;
}

function ResendVerification({ phone }: { phone: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function resend() {
    setState("sending");
    try {
      await authApi.resendVerification(phone);
    } finally {
      setState("sent");
    }
  }

  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>Votre compte n'est pas encore activé.</Text>
      {state === "sent" ? (
        <Text style={styles.noticeText}>Email d'activation renvoyé. Ouvrez le lien qu'il contient, puis reconnectez-vous.</Text>
      ) : (
        <Pressable onPress={resend} disabled={state === "sending"}>
          <Text style={styles.noticeLink}>{state === "sending" ? "Envoi…" : "Renvoyer l'email d'activation"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 28 },
  back: { alignSelf: "flex-start" },
  header: { alignItems: "center", gap: 6 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.mutedForeground },
  form: { gap: 16 },
  forgot: { alignSelf: "flex-end", marginTop: -6 },
  link: { fontSize: 14, fontWeight: "600", color: colors.orange },
  serverError: {
    fontSize: 14,
    color: colors.danger,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
  },
  notice: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A", borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  noticeTitle: { fontSize: 14, fontWeight: "600", color: "#92400E" },
  noticeText: { fontSize: 14, color: "#92400E" },
  noticeLink: { fontSize: 14, fontWeight: "600", color: "#92400E", textDecorationLine: "underline" },
  footer: { alignItems: "center", gap: 4, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20 },
  footerText: { fontSize: 14, color: colors.mutedForeground },
  footerNote: { fontSize: 12, color: colors.mutedForeground, textAlign: "center", marginTop: 8 },
});
