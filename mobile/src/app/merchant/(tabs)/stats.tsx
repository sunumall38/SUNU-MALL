import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { getStoreSummary, listSales, listStoreBestSellers } from "@/lib/merchant";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { Product, SalesDay, StoreSummary } from "@/types";

const DAYS = 14;

/** Les 14 derniers jours, du plus ancien au plus récent (0 FCFA les jours sans vente). */
function lastDays(sales: SalesDay[]) {
  const byDate = new Map(sales.map((day) => [day.date, Number(day.total_sales)]));
  return Array.from({ length: DAYS }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (DAYS - 1 - i));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { key, day: date.getDate(), amount: byDate.get(key) ?? 0 };
  });
}

export default function MerchantStatsScreen() {
  const storeId = useMerchantStore((s) => s.store?.id ?? "");
  const [summary, setSummary] = useState<StoreSummary | null>(null);
  const [sales, setSales] = useState<SalesDay[]>([]);
  const [bestSellers, setBestSellers] = useState<(Product & { sold_quantity?: number })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextSummary, nextSales, nextBest] = await Promise.all([
        getStoreSummary(storeId),
        listSales(storeId).catch(() => []),
        listStoreBestSellers(storeId).catch(() => []),
      ]);
      setSummary(nextSummary);
      setSales(nextSales);
      setBestSellers(nextBest);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les statistiques."));
    }
  }, [storeId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const days = lastDays(sales);
  const max = Math.max(1, ...days.map((d) => d.amount));

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
      >
        <Text style={styles.title}>Statistiques</Text>
        <Text style={styles.subtitle}>30 derniers jours, commandes annulées exclues.</Text>

        {!summary ? (
          error ? (
            <View style={styles.state}>
              <Text style={styles.muted}>{error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator size="large" color={colors.orange} style={styles.loader} />
          )
        ) : (
          <>
            <View style={styles.grid}>
              <Stat label="Chiffre d'affaires" value={formatPrice(summary.revenue_30d)} accent={colors.success} />
              <Stat label="Commandes" value={String(summary.orders_30d)} />
              <Stat label="Panier moyen" value={formatPrice(summary.avg_order_value_30d)} />
              <Stat label="Taux de livraison" value={`${Math.round(summary.delivered_rate)} %`} />
              <Stat
                label="Avis clients"
                value={summary.avg_rating != null ? `★ ${summary.avg_rating.toFixed(1)}` : "—"}
                hint={`${summary.review_count} avis`}
              />
            </View>

            <Text style={styles.sectionTitle}>Ventes des 14 derniers jours</Text>
            <View style={styles.card}>
              <View style={styles.chart} accessibilityLabel="Graphique des ventes par jour">
                {days.map((d) => (
                  <View key={d.key} style={styles.barColumn}>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${(d.amount / max) * 100}%` }, d.amount === 0 && styles.barEmpty]} />
                    </View>
                    <Text style={styles.barLabel}>{d.day}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.muted}>Meilleur jour : {formatPrice(Math.max(...days.map((d) => d.amount)))}</Text>
            </View>

            <Text style={styles.sectionTitle}>Meilleures ventes</Text>
            <View style={styles.card}>
              {bestSellers.length === 0 ? (
                <Text style={styles.muted}>Pas encore de vente.</Text>
              ) : (
                bestSellers.slice(0, 5).map((product, index) => (
                  <View key={product.id} style={[styles.bestRow, index > 0 && styles.divider]}>
                    <Text style={styles.rank}>{index + 1}</Text>
                    <Text style={styles.bestName} numberOfLines={1}>
                      {product.name}
                    </Text>
                    <Text style={styles.bestQty}>{product.sold_quantity ?? 0} vendus</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, hint, accent = colors.ink }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: -8 },
  loader: { marginTop: 48 },
  state: { gap: 12, alignItems: "center", padding: 24 },
  muted: { fontSize: 13, color: colors.mutedForeground },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 6, ...shadow },
  statLabel: { fontSize: 13, color: colors.mutedForeground },
  statValue: { fontSize: 20, fontWeight: "800" },
  statHint: { fontSize: 12, color: colors.mutedForeground },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 8 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 10, ...shadow },
  chart: { flexDirection: "row", alignItems: "flex-end", height: 140, gap: 4 },
  barColumn: { flex: 1, alignItems: "center", gap: 4, height: "100%" },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4, backgroundColor: colors.orange, minHeight: 3 },
  barEmpty: { backgroundColor: colors.border },
  barLabel: { fontSize: 10, color: colors.mutedForeground },
  bestRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rank: { width: 22, fontSize: 14, fontWeight: "800", color: colors.orange },
  bestName: { flex: 1, fontSize: 14, color: colors.ink },
  bestQty: { fontSize: 13, fontWeight: "700", color: colors.ink },
});
