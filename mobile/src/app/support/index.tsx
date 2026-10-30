import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { LoginPrompt } from "@/components/EmptyState";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { formatDate } from "@/lib/orderStatus";
import { createTicket, listTickets, TICKET_CATEGORIES, TICKET_STATUS, type SupportTicket, type TicketCategory } from "@/lib/support";
import { useAuthStore } from "@/store/auth";
import { colors, radius, shadow } from "@/theme";

export default function SupportScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  if (!signedIn) {
    return (
      <LoginPrompt
        icon="chatbubbles-outline"
        title="Aide et support"
        text="Connectez-vous pour écrire au support Sunu Mall et suivre ses réponses."
      />
    );
  }
  return <Tickets />;
}

function Tickets() {
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTickets(await listTickets());
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger vos demandes."));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {writing || tickets?.length === 0 ? (
          <NewTicket
            onCancel={tickets?.length ? () => setWriting(false) : undefined}
            onCreated={(ticket) => {
              setWriting(false);
              router.push({ pathname: "/support/[id]", params: { id: ticket.id } });
            }}
          />
        ) : (
          <Button label="Nouvelle demande" onPress={() => setWriting(true)} />
        )}

        {tickets === null ? (
          error ? (
            <View style={styles.state}>
              <Text style={styles.muted}>{error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          )
        ) : tickets.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Mes demandes</Text>
            {tickets.map((ticket) => {
              const status = TICKET_STATUS[ticket.status] ?? { label: ticket.status, done: false };
              const answered = ticket.status === "answered";
              return (
                <Pressable
                  key={ticket.id}
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: "/support/[id]", params: { id: ticket.id } })}
                  style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.subject} numberOfLines={1}>
                      {ticket.subject}
                    </Text>
                    <Text style={styles.muted}>
                      {ticket.reference} · {formatDate(ticket.created_at)}
                    </Text>
                  </View>
                  <Badge
                    label={status.label}
                    color={answered ? colors.success : status.done ? colors.mutedForeground : colors.orangeDark}
                    background={answered ? colors.successBg : status.done ? colors.muted : colors.accent}
                  />
                  <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function NewTicket({ onCreated, onCancel }: { onCreated: (ticket: SupportTicket) => void; onCancel?: () => void }) {
  const [category, setCategory] = useState<TicketCategory>("question");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim() || !description.trim()) {
      setError("Indiquez un sujet et décrivez votre demande.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      onCreated(await createTicket({ category, subject: subject.trim(), description: description.trim() }));
    } catch (err) {
      setError(apiErrorMessage(err, "Envoi impossible. Réessayez."));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Écrire au support</Text>
      <Text style={styles.muted}>Notre équipe vous répond ici, dans l'appli.</Text>
      <View style={styles.chips}>
        {TICKET_CATEGORIES.map((c) => {
          const selected = c.id === category;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextField label="Sujet" value={subject} onChangeText={setSubject} maxLength={255} />
      <TextField
        label="Votre message"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={5}
        style={styles.multiline}
        hint="Précisez le numéro de commande si votre demande la concerne."
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Envoyer" onPress={send} loading={sending} />
      {onCancel ? <Button label="Annuler" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 13, color: colors.mutedForeground },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  cardBody: { flex: 1, gap: 3 },
  subject: { fontSize: 15, fontWeight: "700", color: colors.ink },
  form: { gap: 12, backgroundColor: colors.white, borderRadius: radius.md, padding: 16, ...shadow },
  formTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextSelected: { color: colors.orangeDark },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  error: { fontSize: 13, color: colors.danger },
});
