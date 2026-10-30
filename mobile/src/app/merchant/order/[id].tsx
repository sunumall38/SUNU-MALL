import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { cancelOrder, confirmOrder, getStoreOrder, markOrderReady } from "@/lib/merchant";
import { merchantOrderStage, merchantOrderSteps, orderItemsAmount } from "@/lib/merchantOrders";
import { formatDate } from "@/lib/orderStatus";
import { colors, radius, shadow } from "@/theme";
import type { DeliveryType, MerchantOrder } from "@/types";

const DELIVERY_LABELS: Record<DeliveryType, string> = {
  standard: "Livraison standard",
  express: "Livraison express",
  pickup: "Retrait en boutique",
};

export default function MerchantOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<MerchantOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cancel" | "confirm" | "ready" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrder(await getStoreOrder(id));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger cette commande."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!order) {
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

  const current = order;
  const stage = merchantOrderStage(current);
  const steps = merchantOrderSteps(current);
  const shippedOrDone = stage.label === "Expédiée" || stage.bucket === "delivered";
  const canConfirm = current.status === "paid" && !shippedOrDone;
  const canMarkReady = current.status === "processing" && !current.ready_at && !shippedOrDone;

  async function advance(action: "confirm" | "ready") {
    setBusy(action);
    setError(null);
    try {
      setOrder(await (action === "confirm" ? confirmOrder(current.id) : markOrderReady(current.id)));
    } catch (err) {
      setError(apiErrorMessage(err, "L'opération a échoué. Réessayez."));
    } finally {
      setBusy(null);
    }
  }

  function confirmCancel() {
    Alert.alert(
      "Annuler la commande ?",
      current.payment?.status === "success"
        ? "Le stock sera libéré et le client remboursé."
        : "Le stock sera libéré.",
      [
        { text: "Non", style: "cancel" },
        {
          text: "Annuler la commande",
          style: "destructive",
          onPress: async () => {
            setBusy("cancel");
            setError(null);
            try {
              setOrder(await cancelOrder(current.id));
            } catch (err) {
              setError(apiErrorMessage(err, "Impossible d'annuler cette commande."));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: `Commande #${current.id.slice(0, 8).toUpperCase()}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.customer}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={20} color={colors.orangeDark} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.value}>{current.customer_name}</Text>
              <Text style={styles.muted}>Commande du {formatDate(current.created_at)}</Text>
            </View>
            <Badge label={stage.label} color={stage.color} background={stage.background} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Produits</Text>
        <View style={styles.card}>
          {current.items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={2}>
                {item.product_name}
                <Text style={styles.muted}>
                  {"  "}
                  {item.quantity} × {formatPrice(item.unit_price)}
                </Text>
              </Text>
              <Text style={styles.value}>{formatPrice(Number(item.unit_price) * item.quantity)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.itemRow}>
            <Text style={styles.total}>Total</Text>
            <Text style={styles.total}>{formatPrice(orderItemsAmount(current))}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Livraison</Text>
        <View style={styles.card}>
          <Text style={styles.value}>{current.delivery_type ? DELIVERY_LABELS[current.delivery_type] : "Livraison"}</Text>
          {current.address_detail ? (
            <Text style={styles.muted}>
              {current.address_detail.street}, {current.address_detail.city}
            </Text>
          ) : null}
          {current.global_order ? (
            <Text style={styles.muted}>Commande groupée avec d'autres boutiques : un livreur passe chez chacune.</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>Statut</Text>
        <View style={styles.card}>
          {current.status === "cancelled" ? (
            <Text style={[styles.value, { color: colors.danger }]}>Commande annulée</Text>
          ) : (
            steps.map((step, index) => (
              <View key={step.label} style={styles.step}>
                <View style={styles.stepRail}>
                  <View
                    style={[
                      styles.stepDot,
                      step.done && styles.stepDone,
                      step.current && styles.stepCurrent,
                    ]}
                  />
                  {index < steps.length - 1 ? <View style={[styles.stepLine, step.done && styles.stepLineDone]} /> : null}
                </View>
                <Text style={[styles.stepLabel, (step.done || step.current) && styles.stepLabelActive]}>
                  {step.label}
                  {step.current ? " — en cours" : ""}
                </Text>
              </View>
            ))
          )}
          {current.status === "pending" ? (
            <Text style={styles.muted}>Ne préparez pas encore : le client n'a pas payé.</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {canConfirm || canMarkReady || current.can_be_cancelled ? (
        <View style={styles.bottomBar}>
          {canConfirm ? (
            <Button label="Confirmer la commande" onPress={() => advance("confirm")} loading={busy === "confirm"} disabled={busy !== null} />
          ) : null}
          {canMarkReady ? (
            <Button label="Colis prêt à récupérer" onPress={() => advance("ready")} loading={busy === "ready"} disabled={busy !== null} />
          ) : null}
          {current.can_be_cancelled ? (
            <Button
              label="Annuler la commande"
              variant={canConfirm || canMarkReady ? "ghost" : "secondary"}
              onPress={confirmCancel}
              loading={busy === "cancel"}
              disabled={busy !== null}
            />
          ) : null}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, gap: 10, paddingBottom: 32 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 8, ...shadow },
  customer: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.peach,
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.ink, marginTop: 6 },
  value: { fontSize: 14, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.mutedForeground },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  itemName: { flex: 1, fontSize: 14, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.border },
  total: { fontSize: 16, fontWeight: "800", color: colors.ink },
  step: { flexDirection: "row", gap: 12, minHeight: 32 },
  stepRail: { alignItems: "center", width: 14 },
  stepDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  stepDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepCurrent: { borderColor: colors.orange },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.border },
  stepLineDone: { backgroundColor: colors.success },
  stepLabel: { fontSize: 14, color: colors.mutedForeground, marginTop: -2 },
  stepLabelActive: { color: colors.ink, fontWeight: "600" },
  error: { fontSize: 14, color: colors.danger },
  bottomBar: { padding: 16, gap: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
});
