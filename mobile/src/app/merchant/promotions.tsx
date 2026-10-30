import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { createPromotion, listMyProducts, listPromotions, stopPromotion, type SponsoredProduct } from "@/lib/merchant";
import { formatDate } from "@/lib/orderStatus";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { Product } from "@/types";

const DURATIONS = [7, 14, 30];

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const STATUS = {
  active: { label: "En cours", color: colors.success, background: colors.successBg },
  inactive: { label: "Arrêtée", color: colors.mutedForeground, background: colors.muted },
  expired: { label: "Terminée", color: colors.mutedForeground, background: colors.muted },
} as const;

/** Mettre un produit en avant dans la section « Promotions » de l'accueil client. */
export default function PromotionsScreen() {
  const storeId = useMerchantStore((s) => s.store?.id ?? "");
  const [promotions, setPromotions] = useState<SponsoredProduct[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [budget, setBudget] = useState("2000");
  const [saving, setSaving] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, mine] = await Promise.all([listPromotions(), listMyProducts(storeId, 1)]);
      setPromotions(list);
      setProducts(mine.results.filter((p) => p.status === "active"));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger vos promotions."));
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const amount = Number(budget.replace(/\D/g, ""));
    if (!productId || !amount) {
      setError("Choisissez un produit et un budget par jour.");
      return;
    }
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + days);
    setSaving(true);
    setError(null);
    try {
      await createPromotion({ product: productId, store: storeId, daily_budget: amount, starts_at: isoDate(start), ends_at: isoDate(end) });
      setProductId(null);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de lancer la promotion."));
    } finally {
      setSaving(false);
    }
  }

  async function stop(id: string) {
    setStopping(id);
    try {
      await stopPromotion(id);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'arrêter la promotion."));
    } finally {
      setStopping(null);
    }
  }

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "Produit";

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>Vos produits mis en avant apparaissent dans « Promotions » sur l'accueil des clients.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nouvelle promotion</Text>
        <Text style={styles.label}>Produit</Text>
        {products.length === 0 ? (
          <Text style={styles.muted}>Publiez d'abord un produit pour pouvoir le mettre en avant.</Text>
        ) : (
          <View style={styles.chips}>
            {products.map((p) => {
              const selected = p.id === productId;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setProductId(p.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Text style={styles.label}>Durée</Text>
        <View style={styles.chips}>
          {DURATIONS.map((d) => {
            const selected = d === days;
            return (
              <Pressable
                key={d}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setDays(d)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{d} jours</Text>
              </Pressable>
            );
          })}
        </View>
        <TextField label="Budget par jour (FCFA)" keyboardType="number-pad" value={budget} onChangeText={setBudget} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Lancer la promotion" onPress={create} loading={saving} disabled={products.length === 0} />
      </View>

      <Text style={styles.sectionTitle}>Mes promotions</Text>
      {promotions === null ? (
        <ActivityIndicator color={colors.orange} style={styles.loader} />
      ) : promotions.length === 0 ? (
        <Text style={styles.muted}>Aucune promotion pour l'instant.</Text>
      ) : (
        promotions.map((promo) => {
          const status = STATUS[promo.status] ?? STATUS.inactive;
          return (
            <View key={promo.id} style={styles.promo}>
              <View style={styles.flex}>
                <Text style={styles.promoName} numberOfLines={1}>
                  {productName(promo.product)}
                </Text>
                <Text style={styles.muted}>
                  {formatDate(promo.starts_at)} → {formatDate(promo.ends_at)} · {formatPrice(promo.daily_budget)} / jour
                </Text>
              </View>
              <View style={styles.promoRight}>
                <Badge label={status.label} color={status.color} background={status.background} />
                {promo.status === "active" ? (
                  <Pressable accessibilityRole="button" onPress={() => stop(promo.id)} disabled={stopping === promo.id} hitSlop={8}>
                    <Text style={styles.stop}>{stopping === promo.id ? "…" : "Arrêter"}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  flex: { flex: 1 },
  intro: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground },
  muted: { fontSize: 13, color: colors.mutedForeground },
  loader: { marginVertical: 16 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 16, gap: 10, ...shadow },
  cardTitle: { fontSize: 17, fontWeight: "800", color: colors.ink },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    maxWidth: "100%",
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
  error: { fontSize: 13, color: colors.danger },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 6 },
  promo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    ...shadow,
  },
  promoName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  promoRight: { alignItems: "flex-end", gap: 6 },
  stop: { fontSize: 13, fontWeight: "700", color: colors.danger },
});
