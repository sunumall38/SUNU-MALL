import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { getWallet, requestPayout } from "@/lib/merchant";
import { formatDate } from "@/lib/orderStatus";
import { colors, radius, shadow } from "@/theme";
import type { SellerWallet, WalletTransaction } from "@/types";

const TYPE_LABELS: Record<WalletTransaction["type"], string> = {
  sale: "Vente",
  refund: "Remboursement",
  payout: "Retrait",
  release: "Fonds disponibles",
  adjustment: "Ajustement",
};

/** Solde du vendeur et derniers mouvements (les retraits se demandent sur le site). */
export default function WalletScreen() {
  const [data, setData] = useState<SellerWallet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getWallet());
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger le portefeuille."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!data) {
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

  const { wallet } = data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
    >
      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>Solde disponible</Text>
        <Text style={styles.balanceValue}>{formatPrice(wallet.available_balance)}</Text>
        <Text style={styles.balanceHint}>En attente : {formatPrice(wallet.pending_balance)}</Text>
      </View>

      {data.subscription && !data.subscription.can_sell ? (
        <Text style={styles.warning}>
          Votre abonnement a expiré : vous ne pouvez plus recevoir de nouvelles commandes.
        </Text>
      ) : null}

      <View style={styles.row}>
        <View style={styles.tile}>
          <Text style={styles.muted}>Total gagné</Text>
          <Text style={styles.tileValue}>{formatPrice(wallet.total_earned)}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.muted}>Total retiré</Text>
          <Text style={styles.tileValue}>{formatPrice(wallet.total_withdrawn)}</Text>
        </View>
      </View>

      <PayoutForm available={Number(wallet.available_balance)} onDone={load} />

      <Text style={styles.sectionTitle}>Derniers mouvements</Text>
      <View style={styles.card}>
        {data.recent_wallet_transactions.length === 0 ? (
          <Text style={styles.muted}>Aucun mouvement pour l'instant.</Text>
        ) : (
          data.recent_wallet_transactions.map((tx, index) => {
            const amount = Number(tx.amount);
            return (
              <View key={tx.id} style={[styles.txRow, index > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text style={styles.txLabel}>{TYPE_LABELS[tx.type] ?? tx.type}</Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {formatDate(tx.created_at)}
                    {tx.description ? ` · ${tx.description}` : ""}
                  </Text>
                </View>
                <Text style={[styles.txAmount, { color: amount < 0 ? colors.danger : colors.success }]}>
                  {amount > 0 ? "+" : ""}
                  {formatPrice(amount)}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

/** Retrait du solde disponible vers Wave ou Orange Money. */
function PayoutForm({ available, onDone }: { available: number; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"wave" | "orange_money">("wave");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) {
    return (
      <Button
        label="Demander un retrait"
        variant="secondary"
        disabled={available <= 0}
        onPress={() => {
          setOpen(true);
          setAmount(String(Math.floor(available)));
          setMessage(null);
        }}
      />
    );
  }

  async function submit() {
    const value = Number(amount.replace(/[\s\u202f.]/g, ""));
    if (!Number.isInteger(value) || value <= 0 || value > available) {
      setMessage({ text: `Montant entre 1 et ${formatPrice(available)}.`, error: true });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await requestPayout(value, method);
      await onDone();
      setOpen(false);
      setMessage({ text: "Demande envoyée : Sunu Mall vous verse le montant sous peu.", error: false });
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, "Demande impossible pour le moment."), error: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.payout}>
        <TextField label="Montant (FCFA)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        <View style={styles.methods}>
          {(["wave", "orange_money"] as const).map((id) => {
            const selected = id === method;
            return (
              <Pressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setMethod(id)}
                style={[styles.method, selected && styles.methodSelected]}
              >
                <Text style={[styles.methodText, selected && styles.methodTextSelected]}>
                  {id === "wave" ? "Wave" : "Orange Money"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.muted}>Le retrait est versé sur le numéro de votre compte.</Text>
        {message ? <Text style={message.error ? styles.payoutError : styles.payoutOk}>{message.text}</Text> : null}
        <Button label="Confirmer le retrait" onPress={submit} loading={submitting} />
        <Button label="Annuler" variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  flex: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  muted: { fontSize: 13, color: colors.mutedForeground },
  balance: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: 20, gap: 4 },
  balanceLabel: { fontSize: 14, color: "#CBD5E1" },
  balanceValue: { fontSize: 30, fontWeight: "800", color: colors.white },
  balanceHint: { fontSize: 13, color: colors.peach },
  warning: { fontSize: 14, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: radius.sm, padding: 10, overflow: "hidden" },
  row: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 4, ...shadow },
  tileValue: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 8 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 6, ...shadow },
  txRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  txLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  txAmount: { fontSize: 14, fontWeight: "800" },
  payout: { gap: 12, paddingVertical: 10 },
  methods: { flexDirection: "row", gap: 10 },
  method: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  methodSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  methodText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  methodTextSelected: { color: colors.orangeDark },
  payoutError: { fontSize: 13, color: colors.danger },
  payoutOk: { fontSize: 13, color: colors.success },
});
