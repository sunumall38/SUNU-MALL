import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { DELIVERY_STATUS_LABEL, HANDOVER_STATUSES } from "@/lib/orderStatus";
import { confirmDelivery } from "@/lib/orders";
import { colors, radius } from "@/theme";
import type { OrderDelivery } from "@/types";

const FINISHED = new Set(["delivered", "cancelled", "returned"]);

/**
 * Suivi de la course dans le détail d'une commande : statut, livreur à
 * appeler, et confirmation de la réception avec le code remis par le
 * livreur. Relit la commande toutes les 20 s tant que la course est active.
 */
export function DeliveryTracker({ delivery, refresh }: { delivery: OrderDelivery; refresh: () => Promise<void> }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const active = !FINISHED.has(delivery.status);
  const driver = delivery.driver_detail;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => void refresh(), 20000);
    return () => clearInterval(timer);
  }, [active, refresh]);

  async function confirm() {
    if (!/^\d{4,8}$/.test(code.trim())) {
      setError("Entrez le code donné par le livreur.");
      return;
    }
    setError(null);
    setConfirming(true);
    try {
      await confirmDelivery(delivery.id, code.trim());
      await refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Code refusé. Vérifiez-le avec le livreur."));
    } finally {
      setConfirming(false);
    }
  }

  const minutes = delivery.eta_seconds ? Math.max(1, Math.round(delivery.eta_seconds / 60)) : null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.statusRow}>
        <Ionicons
          name={delivery.status === "delivered" ? "checkmark-circle" : "bicycle"}
          size={20}
          color={delivery.status === "delivered" ? colors.success : colors.orange}
        />
        <Text style={styles.status}>{DELIVERY_STATUS_LABEL[delivery.status] ?? delivery.status}</Text>
        {minutes && HANDOVER_STATUSES.has(delivery.status) ? <Text style={styles.eta}>≈ {minutes} min</Text> : null}
      </View>

      {driver && active ? (
        <View style={styles.driver}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={18} color={colors.orangeDark} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.driverName}>{driver.full_name}</Text>
            <Text style={styles.muted}>Votre livreur</Text>
          </View>
          {driver.phone ? (
            <Button label="Appeler" variant="secondary" onPress={() => Linking.openURL(`tel:${driver.phone}`)} />
          ) : null}
        </View>
      ) : null}

      {HANDOVER_STATUSES.has(delivery.status) ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmTitle}>Vous avez reçu votre colis ?</Text>
          <Text style={styles.muted}>Entrez le code que le livreur vous donne à la remise.</Text>
          <TextField label="Code de réception" keyboardType="number-pad" value={code} onChangeText={setCode} error={error} maxLength={8} />
          <Button label="Confirmer la réception" onPress={confirm} loading={confirming} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  flex: { flex: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  status: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
  eta: { fontSize: 13, fontWeight: "700", color: colors.orangeDark },
  driver: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.muted, borderRadius: radius.md, padding: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: colors.peach },
  driverName: { fontSize: 14, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.mutedForeground },
  confirm: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  confirmTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
});
