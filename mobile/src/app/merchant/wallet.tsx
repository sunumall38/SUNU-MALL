import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { formatPrice } from "@/lib/format";
import { getWallet } from "@/lib/merchant";
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

      <Button label="Demander un retrait sur le site" variant="secondary" onPress={() => Linking.openURL(`${SITE_URL}/merchant-wallet`)} />

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
});
