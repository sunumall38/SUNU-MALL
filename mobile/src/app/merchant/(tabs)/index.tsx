import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { SITE_URL } from "@/lib/config";
import { formatPrice, timeAgo } from "@/lib/format";
import { getStoreSummary, listStoreOrders } from "@/lib/merchant";
import { needsAction, orderItemsAmount } from "@/lib/merchantOrders";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { MerchantOrder, OwnStore, StoreSummary } from "@/types";

function isToday(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

export default function MerchantDashboard() {
  const userId = useAuthStore((s) => s.user?.id);
  const store = useMerchantStore((s) => s.store) as OwnStore;
  const account = useMerchantStore((s) => s.account);
  const reloadMerchant = useMerchantStore((s) => s.load);
  const [orders, setOrders] = useState<MerchantOrder[] | null>(null);
  const [summary, setSummary] = useState<StoreSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [nextOrders, nextSummary] = await Promise.all([
      listStoreOrders(store.id).catch(() => null),
      getStoreSummary(store.id).catch(() => null),
    ]);
    if (nextOrders) setOrders(nextOrders);
    if (nextSummary) setSummary(nextSummary);
  }, [store.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await Promise.all([load(), userId ? reloadMerchant(userId) : null]);
    setRefreshing(false);
  }

  // Ventes du jour : commandes payées d'aujourd'hui, hors frais de livraison.
  const paidOrders = (orders ?? []).filter((o) => o.status !== "pending" && o.status !== "cancelled");
  const salesToday = paidOrders.filter((o) => isToday(o.created_at)).reduce((sum, o) => sum + orderItemsAmount(o), 0);
  const toPrepare = (orders ?? []).filter(needsAction).length;
  const limit = account?.product_limit;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
      >
        <View>
          <Text style={styles.hello}>Bonjour, {store.name} 👋</Text>
          <StoreStatusLine store={store} />
        </View>

        <StoreBanners store={store} />
        {account && account.product_limit === 0 ? (
          <Notice
            tone="danger"
            text="Vous n'avez pas d'abonnement actif : la création de nouveaux produits est suspendue."
            action="Voir les offres"
            onPress={() => Linking.openURL(`${SITE_URL}/subscriptions`)}
          />
        ) : account?.subscription?.in_grace ? (
          <Notice
            tone="warning"
            text="Votre abonnement a expiré : vous êtes en période de grâce. Renouvelez-le pour continuer à vendre."
            action="Renouveler"
            onPress={() => Linking.openURL(`${SITE_URL}/subscriptions`)}
          />
        ) : null}

        <View style={styles.grid}>
          <Kpi
            label="Ventes aujourd'hui"
            value={orders ? formatPrice(salesToday) : "…"}
            accent={colors.success}
            onPress={() => router.navigate("/merchant/stats")}
          />
          <Kpi
            label="Commandes (30 j)"
            value={summary ? String(summary.orders_30d) : "…"}
            onPress={() => router.navigate("/merchant/orders")}
          />
          <Kpi
            label="Produits"
            value={account ? `${account.product_count}${limit ? ` / ${limit}` : ""}` : "…"}
            onPress={() => router.navigate("/merchant/products")}
          />
          <Kpi
            label="Avis clients"
            value={summary?.avg_rating != null ? `★ ${summary.avg_rating.toFixed(1)}` : "—"}
            hint={summary ? `${summary.review_count} avis` : undefined}
            onPress={() => router.navigate("/merchant/stats")}
          />
        </View>

        {toPrepare > 0 ? (
          <View style={styles.todo}>
            <Text style={styles.todoText}>
              {toPrepare} commande{toPrepare > 1 ? "s" : ""} à traiter
            </Text>
            <Button label="Voir les commandes" onPress={() => router.navigate("/merchant/orders")} />
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Ventes récentes</Text>
        <View style={styles.card}>
          {orders === null ? (
            <Text style={styles.muted}>Chargement…</Text>
          ) : paidOrders.length === 0 ? (
            <Text style={styles.muted}>Aucune vente pour l'instant.</Text>
          ) : (
            paidOrders.slice(0, 5).map((order, index) => (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/merchant/order/[id]", params: { id: order.id } })}
                style={[styles.saleRow, index > 0 && styles.divider]}
              >
                <View style={styles.flex}>
                  <Text style={styles.saleRef}>#{order.id.slice(0, 8).toUpperCase()}</Text>
                  <Text style={styles.time}>{timeAgo(order.created_at)}</Text>
                </View>
                <Text style={styles.saleAmount}>{formatPrice(orderItemsAmount(order))}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreStatusLine({ store }: { store: OwnStore }) {
  if (store.status === "active") {
    return (
      <View style={styles.statusRow}>
        <Text style={[styles.status, { color: colors.success }]}>Votre boutique est active</Text>
        <Ionicons name="checkmark-circle" size={15} color={colors.success} />
      </View>
    );
  }
  const rejected = store.status === "suspended" && Boolean(store.rejection_reason);
  return (
    <Text style={[styles.status, { color: store.status === "inactive" ? colors.warning : colors.danger }]}>
      {store.status === "inactive" ? "En attente de validation" : rejected ? "Boutique refusée" : "Boutique suspendue"}
    </Text>
  );
}

/** Boutique pas encore visible des clients : on explique pourquoi. */
function StoreBanners({ store }: { store: OwnStore }) {
  if (store.status === "inactive") {
    return (
      <Notice
        tone="warning"
        text="Votre dossier (identité et boutique) est en cours d'examen. Vos produits seront visibles dès la validation."
      />
    );
  }
  if (store.status === "suspended" && store.rejection_reason) {
    return (
      <Notice
        tone="danger"
        text={`Boutique refusée : ${store.rejection_reason}`}
        action="Corriger ma boutique sur le site"
        onPress={() => Linking.openURL(`${SITE_URL}/create-shop`)}
      />
    );
  }
  if (store.status === "suspended") {
    return <Notice tone="danger" text="Votre boutique est suspendue. Contactez le support Sunu Mall." />;
  }
  return null;
}

function Notice({
  tone,
  text,
  action,
  onPress,
}: {
  tone: "warning" | "danger";
  text: string;
  action?: string;
  onPress?: () => void;
}) {
  const palette =
    tone === "danger" ? { color: colors.danger, background: "#FEF2F2" } : { color: colors.warning, background: colors.warningBg };
  return (
    <View style={[styles.notice, { backgroundColor: palette.background }]}>
      <Text style={[styles.noticeText, { color: palette.color }]}>{text}</Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
          <Text style={[styles.noticeAction, { color: palette.color }]}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Kpi({
  label,
  value,
  hint,
  accent = colors.ink,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.kpi, pressed && styles.pressed]}>
      <View style={styles.kpiTop}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.kpiValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  hello: { fontSize: 22, fontWeight: "800", color: colors.ink },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  status: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  notice: { borderRadius: radius.md, padding: 12, gap: 6 },
  noticeText: { fontSize: 14, lineHeight: 20 },
  noticeAction: { fontSize: 14, fontWeight: "800", textDecorationLine: "underline" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    gap: 6,
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  kpiTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kpiLabel: { fontSize: 13, color: colors.mutedForeground },
  kpiValue: { fontSize: 22, fontWeight: "800" },
  kpiHint: { fontSize: 12, color: colors.mutedForeground },
  todo: {
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.peach,
  },
  todoText: { fontSize: 16, fontWeight: "800", color: colors.orangeDark },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 4, ...shadow },
  muted: { fontSize: 13, color: colors.mutedForeground, paddingVertical: 8 },
  saleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  saleRef: { fontSize: 14, fontWeight: "700", color: colors.ink },
  time: { fontSize: 12, color: colors.mutedForeground },
  saleAmount: { fontSize: 15, fontWeight: "800", color: colors.ink },
});
