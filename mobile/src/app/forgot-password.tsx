import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import * as authApi from "@/lib/auth";
import { colors } from "@/theme";

/** Mot de passe oublié : un lien de réinitialisation part vers l'email du compte. */
export default function ForgotPasswordScreen() {
  const [login, setLogin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const identifier = authApi.parseIdentifier(login);
    if (!identifier) {
      setError(authApi.IDENTIFIER_ERROR);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await authApi.requestPasswordReset(identifier);
      setSent(result.message);
    } catch (err) {
      setError(apiErrorMessage(err, "Envoi impossible pour le moment. Réessayez."));
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
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
            hitSlop={12}
            style={styles.back}
          >
            <Ionicons name="arrow-back" size={24} color={colors.ink} />
          </Pressable>

          <View style={styles.icon}>
            <Ionicons name="key-outline" size={36} color={colors.orange} />
          </View>
          <Text style={styles.title}>Mot de passe oublié</Text>

          {sent ? (
            <>
              <Text style={styles.text}>{sent}</Text>
              <Text style={styles.hint}>
                Le lien ouvre une page où choisir un nouveau mot de passe. Revenez ensuite vous connecter.
              </Text>
              <Button label="Retour à la connexion" onPress={() => router.replace("/login")} />
            </>
          ) : (
            <>
              <Text style={styles.text}>
                Indiquez votre numéro ou votre email : nous envoyons un lien à l'email de votre compte.
              </Text>
              <TextField
                label="Numéro de téléphone ou email"
                placeholder="77 123 45 67 ou nom@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                value={login}
                onChangeText={setLogin}
                error={error}
                onSubmitEditing={submit}
                returnKeyType="send"
              />
              <Button label="Envoyer le lien" onPress={submit} loading={submitting} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 24, gap: 16 },
  back: { alignSelf: "flex-start" },
  icon: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginTop: 24,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, textAlign: "center" },
  text: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground, textAlign: "center" },
  hint: { fontSize: 13, lineHeight: 19, color: colors.mutedForeground, textAlign: "center" },
});
