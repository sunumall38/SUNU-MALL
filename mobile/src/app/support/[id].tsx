import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { getTicket, replyTicket, TICKET_STATUS, type SupportTicket } from "@/lib/support";
import { colors, radius } from "@/theme";

type Bubble = { id: string; body: string; mine: boolean; author: string; at: string };

/** Conversation avec le support : message initial, réponses, envoi d'un nouveau message. */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setTicket(await getTicket(id));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger cette demande."));
    }
  }, [id]);

  useEffect(() => {
    void load();
    // Les réponses du support arrivent sans rechargement manuel.
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      await replyTicket(id, body);
      setDraft("");
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Message non envoyé. Réessayez."));
    } finally {
      setSending(false);
    }
  }

  if (!ticket) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={load} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} />
        )}
      </View>
    );
  }

  const closed = TICKET_STATUS[ticket.status]?.done ?? false;
  const bubbles: Bubble[] = [
    { id: "initial", body: ticket.description, mine: true, author: "Vous", at: ticket.created_at },
    ...ticket.messages.map((m) => ({
      id: m.id,
      body: m.body,
      mine: !m.is_support_reply,
      author: m.is_support_reply ? "Support Sunu Mall" : "Vous",
      at: m.created_at,
    })),
  ].filter((b) => b.body.trim());

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: ticket.reference }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <FlatList
          data={bubbles}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.subject}>{ticket.subject}</Text>
              <Text style={styles.muted}>{TICKET_STATUS[ticket.status]?.label ?? ticket.status}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
              {!item.mine ? <Text style={styles.author}>{item.author}</Text> : null}
              <Text style={[styles.body, item.mine && styles.bodyMine]}>{item.body}</Text>
              <Text style={[styles.time, item.mine && styles.timeMine]}>{timeAgo(item.at)}</Text>
            </View>
          )}
          ListFooterComponent={
            ticket.messages.some((m) => m.is_support_reply) ? undefined : (
              <Text style={styles.waiting}>Le support vous répond ici, en général sous 24 h.</Text>
            )
          }
        />
        {closed ? (
          <Text style={styles.closed}>Cette demande est close. Écrivez une nouvelle demande si besoin.</Text>
        ) : (
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Votre message…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              style={styles.input}
              accessibilityLabel="Votre message"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              onPress={send}
              disabled={sending || !draft.trim()}
              style={[styles.sendButton, (sending || !draft.trim()) && styles.disabled]}
            >
              {sending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send" size={18} color={colors.white} />}
            </Pressable>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { fontSize: 13, color: colors.mutedForeground },
  list: { padding: 16, gap: 10 },
  header: { gap: 2, marginBottom: 6 },
  subject: { fontSize: 17, fontWeight: "800", color: colors.ink },
  bubble: { maxWidth: "85%", borderRadius: radius.md, padding: 12, gap: 4 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.orange, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.white, borderBottomLeftRadius: 4 },
  author: { fontSize: 12, fontWeight: "700", color: colors.orangeDark },
  body: { fontSize: 15, lineHeight: 21, color: colors.ink },
  bodyMine: { color: colors.white },
  time: { fontSize: 11, color: colors.mutedForeground, alignSelf: "flex-end" },
  timeMine: { color: "#FFE4CC" },
  waiting: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", marginTop: 8 },
  closed: { fontSize: 13, color: colors.mutedForeground, textAlign: "center", padding: 16 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.orange },
  disabled: { opacity: 0.5 },
  error: { fontSize: 13, color: colors.danger, paddingHorizontal: 16, paddingBottom: 8 },
});
