import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { TextField } from "@/components/TextField";
import { apiErrorMessage, apiFieldErrors } from "@/lib/api";
import * as authApi from "@/lib/auth";
import { normalizeSenegalPhone, SENEGAL_PHONE_ERROR, SENEGAL_PHONE_EXAMPLE } from "@/lib/phone";
import { colors } from "@/theme";

type Role = "client" | "merchant";
type Field = "first_name" | "last_name" | "phone" | "email" | "password" | "confirm";

const ROLES: { id: Role; label: string }[] = [
  { id: "client", label: "Je veux acheter" },
  { id: "merchant", label: "Je veux vendre" },
];

/** Création de compte client ou commerçant ; le compte s'active par le lien reçu par email. */
export default function RegisterScreen() {
  const params = useLocalSearchParams<{ role?: string }>();
  const [role, setRole] = useState<Role>(params.role === "merchant" ? "merchant" : "client");
  const [values, setValues] = useState<Record<Field, string>>({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Field) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  async function submit() {
    const phone = normalizeSenegalPhone(values.phone);
    const email = values.email.trim().toLowerCase();
    const nextErrors: Partial<Record<Field, string>> = {
      first_name: values.first_name.trim() ? undefined : "Prénom requis",
      last_name: values.last_name.trim() ? undefined : "Nom requis",
      phone: phone ? undefined : SENEGAL_PHONE_ERROR,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Email invalide",
      password: values.password.length >= 8 ? undefined : "8 caractères minimum",
      confirm: values.confirm === values.password ? undefined : "Les deux mots de passe ne correspondent pas",
    };
    setErrors(nextErrors);
    setServerError(null);
    if (Object.values(nextErrors).some(Boolean) || !phone) return;

    setSubmitting(true);
    try {
      await authApi.register({
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        phone,
        email,
        password: values.password,
        role_name: role,
      });
      router.replace({ pathname: "/verify-pending", params: { email } });
    } catch (err) {
      const fields = apiFieldErrors(err);
      const known = (["first_name", "last_name", "phone", "email", "password"] as const).filter((f) => fields[f]);
      if (known.length) {
        setErrors(Object.fromEntries(known.map((f) => [f, fields[f]])));
      } else {
        setServerError(apiErrorMessage(err, "Inscription impossible pour le moment. Réessayez."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
            hitSlop={12}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>

          <View style={styles.header}>
            <Logo size={56} stacked />
            <Text style={styles.title}>Créer un compte</Text>
            <Text style={styles.subtitle}>
              {role === "merchant"
                ? "Ouvrez votre boutique : vos pièces d'identité vous seront demandées après la connexion."
                : "Achetez dans toutes les boutiques du Sénégal."}
            </Text>
          </View>

          <SegmentedTabs options={ROLES} value={role} onChange={setRole} />

          <View style={styles.form}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField
                  label="Prénom"
                  autoComplete="given-name"
                  textContentType="givenName"
                  value={values.first_name}
                  onChangeText={set("first_name")}
                  error={errors.first_name}
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  label="Nom"
                  autoComplete="family-name"
                  textContentType="familyName"
                  value={values.last_name}
                  onChangeText={set("last_name")}
                  error={errors.last_name}
                />
              </View>
            </View>
            <TextField
              label="Numéro de téléphone"
              prefix="+221"
              placeholder={SENEGAL_PHONE_EXAMPLE}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              value={values.phone}
              onChangeText={set("phone")}
              error={errors.phone}
              hint="Il vous servira à vous connecter."
            />
            <TextField
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={values.email}
              onChangeText={set("email")}
              error={errors.email}
              hint="Le lien d'activation y sera envoyé."
            />
            <TextField
              label="Mot de passe"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={values.password}
              onChangeText={set("password")}
              error={errors.password}
              hint="8 caractères minimum."
            />
            <TextField
              label="Confirmer le mot de passe"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={values.confirm}
              onChangeText={set("confirm")}
              error={errors.confirm}
              onSubmitEditing={submit}
              returnKeyType="go"
            />

            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

            <Button label={role === "merchant" ? "Créer mon compte vendeur" : "Créer mon compte"} onPress={submit} loading={submitting} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Déjà un compte ?</Text>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/login")} hitSlop={8}>
              <Text style={styles.link}>Se connecter</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  back: { alignSelf: "flex-start" },
  header: { alignItems: "center", gap: 6 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, marginTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, textAlign: "center" },
  form: { gap: 14 },
  row: { flexDirection: "row", gap: 12 },
  serverError: { fontSize: 14, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12 },
  footer: { flexDirection: "row", justifyContent: "center", gap: 6 },
  footerText: { fontSize: 14, color: colors.mutedForeground },
  link: { fontSize: 14, fontWeight: "700", color: colors.orange },
});
