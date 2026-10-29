import * as Linking from "expo-linking";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { SITE_URL } from "@/lib/config";
import { formatPrice } from "@/lib/format";
import { formatDate, summarizeGlobalOrder, summarizeOrder } from "@/lib/orderStatus";
import { getGlobalOrder, getOrder } from "@/lib/orders";
import { colors, radius, shadow } from "@/theme";
import type { DeliveryType, GlobalOrder, Order, OrderItem } from "@/types";

const DELIVERY_LABELS: Record<DeliveryType, string> = {
  standard: "Livraison standard",
  express: "Livraison express",
  pickup: "Retrait en boutique",
};

type Loaded = { kind: "order"; order: Order } | { kind: "global"; order: GlobalOrder };

export default function OrderDetailScreen() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind?: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(
        kind === "global"
          ? { kind: "global", order: await getGlobalOrder(id) }
          : { kind: "order", order: await getOrder(id) },
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger cette commande."));
    }
  }, [id, kind]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const summary = data.kind === "global" ? summarizeGlobalOrder(data.order) : summarizeOrder(data.order);
  const order = data.order;
  const groups: { store: string; items: OrderItem[] }[] =
    data.kind === "global"
      ? data.order.orders.map((o) => ({ store: o.store_name, items: o.items }))
      : [{ store: data.order.store_name, items: data.order.items }];
  const itemsTotal = data.kind === "global" ? Number(data.order.items_total) : Number(order.total_amount) - Number(order.delivery_fee);
  const trackingUrl = `${SITE_URL}/tracking?${data.kind === "global" ? "gorder" : "order"}=${order.id}`;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.reference}>{summary.reference}</Text>
          <Text style={[styles.badge, { color: summary.status.color, backgroundColor: summary.status.background }]}>
            {summary.status.label}
          </Text>
        </View>
        <Text style={styles.muted}>Passée le {formatDate(order.created_at)}</Text>
        {summary.paymentId ? (
          <Button
            label="Payer maintenant"
            onPress={() => router.push({ pathname: "/client/payment/[id]", params: { id: summary.paymentId! } })}
          />
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Produits</Text>
      <View style={styles.card}>
        {groups.map((group, index) => (
          <View key={`${group.store}-${index}`} style={styles.group}>
            {groups.length > 1 ? <Text style={styles.store}>{group.store}</Text> : null}
            {group.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.product_name}
                  <Text style={styles.muted}> × {item.quantity}</Text>
                </Text>
                <Text style={styles.itemPrice}>{formatPrice(Number(item.unit_price) * item.quantity)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Livraison</Text>
      <View style={styles.card}>
        <Text style={styles.value}>{order.delivery_type ? DELIVERY_LABELS[order.delivery_type] : "Livraison"}</Text>
        {order.address_detail ? (
          <Text style={styles.muted}>
            {order.address_detail.street}, {order.address_detail.city}
          </Text>
        ) : null}
        {order.status !== "pending" && order.status !== "cancelled" ? (
          <Button label="Suivre la livraison sur le site" variant="ghost" onPress={() => Linking.openURL(trackingUrl)} />
        ) : null}
      </View>

      <View style={styles.card}>
        <Row label="Articles" value={formatPrice(itemsTotal)} />
        <Row label="Livraison" value={Number(order.delivery_fee) === 0 ? "Gratuit" : formatPrice(order.delivery_fee)} />
        <View style={styles.divider} />
        <Row label="Total" value={formatPrice(order.total_amount)} strong />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={strong ? styles.rowStrong : styles.muted}>{label}</Text>
      <Text style={strong ? styles.rowStrong : styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 8, ...shadow },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  reference: { flexShrink: 1, fontSize: 18, fontWeight: "800", color: colors.ink },
  badge: {
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  muted: { fontSize: 14, color: colors.mutedForeground },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.ink, marginTop: 6 },
  group: { gap: 6 },
  store: { fontSize: 13, fontWeight: "700", color: colors.orangeDark },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  itemName: { flex: 1, fontSize: 14, color: colors.ink },
  itemPrice: { fontSize: 14, fontWeight: "700", color: colors.ink },
  value: { fontSize: 14, fontWeight: "600", color: colors.ink },
  divider: { height: 1, backgroundColor: colors.border },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rowStrong: { fontSize: 17, fontWeight: "800", color: colors.ink },
});
