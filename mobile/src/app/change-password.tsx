import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { RoleGate } from "@/components/RoleGate";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { changePassword } from "@/lib/auth";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";

/** Mot de passe provisoire (compte créé par l'admin ou un partenaire) : à changer avant tout. */
export default function ChangePasswordScreen() {
  return (
    <RoleGate href="/change-password">
      <ChangePasswordForm />
    </RoleGate>
  );
}

function ChangePasswordForm() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const nextErrors = {
      current: current ? undefined : "Mot de passe actuel requis",
      next: next.length >= 8 ? undefined : "Au moins 8 caractères",
      confirm: confirm === next ? undefined : "Les deux mots de passe ne correspondent pas",
    };
    setErrors(nextErrors);
    setServerError(null);
    if (nextErrors.current || nextErrors.next || nextErrors.confirm) return;

    setSubmitting(true);
    try {
      await changePassword({ current_password: current, new_password: next, confirm_password: confirm });
      // Le garde renvoie alors vers l'espace du compte.
      await updateUser({ must_change_password: false });
    } catch (err) {
      setServerError(apiErrorMessage(err, "Mot de passe actuel incorrect."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Changer de mot de passe</Text>
            <Text style={styles.subtitle}>
              Pour des raisons de sécurité, choisissez votre propre mot de passe avant de commencer.
            </Text>
          </View>
          <View style={styles.form}>
            <TextField label="Mot de passe provisoire" secureTextEntry value={current} onChangeText={setCurrent} error={errors.current} />
            <TextField
              label="Nouveau mot de passe"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={next}
              onChangeText={setNext}
              error={errors.next}
            />
            <TextField label="Confirmer le mot de passe" secureTextEntry value={confirm} onChangeText={setConfirm} error={errors.confirm} />
            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}
            <Button label="Enregistrer" onPress={submit} loading={submitting} />
            <Button label="Se déconnecter" variant="ghost" onPress={() => void logout()} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 24 },
  header: { gap: 6 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 14, color: colors.mutedForeground },
  form: { gap: 16 },
  serverError: { fontSize: 14, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12 },
});
