import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { EmptyState, LoginPrompt } from "@/components/EmptyState";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { formatDate, summarizeGlobalOrder, summarizeOrder, type OrderBucket, type OrderSummary } from "@/lib/orderStatus";
import { listGlobalOrders, listOrders } from "@/lib/orders";
import { useAuthStore } from "@/store/auth";
import { colors, radius, shadow } from "@/theme";

const TABS: { id: OrderBucket; label: string }[] = [
  { id: "ongoing", label: "En cours" },
  { id: "delivered", label: "Livrées" },
  { id: "cancelled", label: "Annulées" },
];

const EMPTY: Record<OrderBucket, string> = {
  ongoing: "Aucune commande en cours.",
  delivered: "Aucune commande livrée pour l'instant.",
  cancelled: "Aucune commande annulée.",
};

export default function OrdersScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Mes commandes</Text>
      {signedIn ? (
        <OrderList />
      ) : (
        <LoginPrompt icon="receipt-outline" title="Vos commandes" text="Connectez-vous pour suivre vos commandes." />
      )}
    </SafeAreaView>
  );
}

function OrderList() {
  const [tab, setTab] = useState<OrderBucket>("ongoing");
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [globals, singles] = await Promise.all([listGlobalOrders(), listOrders()]);
      // Les sous-commandes d'une commande multi-boutiques sont regroupées sous celle-ci.
      const all = [
        ...globals.map(summarizeGlobalOrder),
        ...singles.filter((o) => !o.global_order).map(summarizeOrder),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setOrders(all);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger vos commandes."));
    }
  }, []);

  // Statuts mis à jour à chaque visite (paiement, livraison).
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

  if (!orders) {
    return error ? (
      <View style={styles.state}>
        <Text style={styles.muted}>{error}</Text>
        <Button label="Réessayer" variant="secondary" onPress={load} />
      </View>
    ) : (
      <ActivityIndicator size="large" color={colors.orange} style={styles.loader} />
    );
  }

  if (orders.length === 0) {
    return (
      <EmptyState icon="receipt-outline" title="Pas encore de commande" text="Vos commandes apparaîtront ici.">
        <Button label="Découvrir les produits" variant="secondary" onPress={() => router.navigate("/client")} />
      </EmptyState>
    );
  }

  const visible = orders.filter((o) => o.bucket === tab);

  return (
    <View style={styles.flex}>
      <View style={styles.tabs}>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(item) => `${item.kind}-${item.id}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
        renderItem={({ item }) => <OrderCard order={item} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : undefined}
        ListEmptyComponent={<Text style={styles.muted}>{EMPTY[tab]}</Text>}
      />
    </View>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/client/orders/[id]", params: { id: order.id, kind: order.kind } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={styles.reference}>{order.reference}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      </View>
      <Text style={styles.meta}>
        {formatDate(order.createdAt)} · {order.articleCount} article{order.articleCount > 1 ? "s" : ""}
      </Text>
      <View style={styles.cardBottom}>
        <Text style={styles.total}>{formatPrice(order.total)}</Text>
        <Text style={[styles.badge, { color: order.status.color, backgroundColor: order.status.background }]}>
          {order.status.label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  tabs: { paddingHorizontal: 16, paddingBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  loader: { marginTop: 48 },
  state: { gap: 12, alignItems: "center", padding: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
  error: { fontSize: 14, color: colors.danger, marginBottom: 4 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 16, gap: 4, ...shadow },
  pressed: { opacity: 0.8 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  reference: { fontSize: 16, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 13, color: colors.mutedForeground },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  total: { fontSize: 16, fontWeight: "800", color: colors.ink },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
