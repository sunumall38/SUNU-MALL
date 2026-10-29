import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { listStoreOrders } from "@/lib/merchant";
import { merchantOrderStage, orderItemsAmount, type MerchantBucket } from "@/lib/merchantOrders";
import { formatDate } from "@/lib/orderStatus";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { MerchantOrder } from "@/types";

type Tab = "all" | Exclude<MerchantBucket, "other">;

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "new", label: "À préparer" },
  { id: "shipping", label: "Expédiées" },
  { id: "delivered", label: "Livrées" },
];

const EMPTY: Record<Tab, string> = {
  all: "Aucune commande pour l'instant.",
  new: "Aucune commande à préparer.",
  shipping: "Aucune commande en route.",
  delivered: "Aucune commande livrée pour l'instant.",
};

export default function MerchantOrdersScreen() {
  const storeId = useMerchantStore((s) => s.store?.id ?? "");
  const [tab, setTab] = useState<Tab>("all");
  const [orders, setOrders] = useState<MerchantOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders(await listStoreOrders(storeId));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les commandes."));
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

  const visible = (orders ?? []).filter((o) => tab === "all" || merchantOrderStage(o).bucket === tab);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Commandes</Text>
      <View style={styles.tabs}>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
      </View>
      {!orders ? (
        error ? (
          <View style={styles.state}>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={load} />
          </View>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} style={styles.loader} />
        )
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
          renderItem={({ item }) => <OrderRow order={item} />}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : undefined}
          ListEmptyComponent={<Text style={styles.muted}>{EMPTY[tab]}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

function OrderRow({ order }: { order: MerchantOrder }) {
  const stage = merchantOrderStage(order);
  const articles = order.items.reduce((n, item) => n + item.quantity, 0);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/merchant/order/[id]", params: { id: order.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <Ionicons name="bag-handle-outline" size={20} color={colors.orange} />
      </View>
      <View style={styles.body}>
        <Text style={styles.reference}>#{order.id.slice(0, 8).toUpperCase()}</Text>
        <Text style={styles.meta}>
          {articles} article{articles > 1 ? "s" : ""} · {formatDate(order.created_at)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.amount}>{formatPrice(orderItemsAmount(order))}</Text>
        <Badge label={stage.label} color={stage.color} background={stage.background} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  tabs: { paddingHorizontal: 16, paddingBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  loader: { marginTop: 48 },
  state: { gap: 12, alignItems: "center", padding: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
  error: { fontSize: 14, color: colors.danger, marginBottom: 4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 14,
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  body: { flex: 1, gap: 3 },
  reference: { fontSize: 15, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 12, color: colors.mutedForeground },
  right: { alignItems: "flex-end", gap: 6 },
  amount: { fontSize: 14, fontWeight: "800", color: colors.ink },
});
