import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import * as authApi from "@/lib/auth";
import { colors } from "@/theme";

/** Après l'inscription : le compte s'active par le lien reçu par email. */
export default function VerifyPendingScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  async function resend() {
    if (!email) return;
    setState("sending");
    try {
      await authApi.resendVerification({ email });
    } finally {
      setState("sent");
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.icon}>
          <Ionicons name="mail-unread-outline" size={40} color={colors.orange} />
        </View>
        <Text style={styles.title}>Activez votre compte</Text>
        <Text style={styles.text}>
          Nous avons envoyé un lien d'activation à{" "}
          <Text style={styles.strong}>{email ?? "votre adresse email"}</Text>. Ouvrez-le, puis revenez vous connecter
          avec votre numéro et votre mot de passe.
        </Text>
        <Text style={styles.hint}>Pas reçu ? Regardez dans les courriers indésirables.</Text>

        <View style={styles.actions}>
          <Button label="Me connecter" onPress={() => router.replace("/login")} />
          {email ? (
            <Button
              label={state === "sent" ? "Email renvoyé ✓" : "Renvoyer l'email"}
              variant="secondary"
              onPress={resend}
              loading={state === "sending"}
              disabled={state === "sent"}
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: 28, gap: 12 },
  icon: {
    alignSelf: "center",
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginBottom: 8,
  },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink, textAlign: "center" },
  text: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground, textAlign: "center" },
  strong: { fontWeight: "700", color: colors.ink },
  hint: { fontSize: 13, color: colors.mutedForeground, textAlign: "center" },
  actions: { gap: 10, marginTop: 16 },
});
