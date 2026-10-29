import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { QuantityStepper } from "@/components/QuantityStepper";
import { SITE_URL } from "@/lib/config";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/store/cart";
import { colors } from "@/theme";
import type { CartItem } from "@/types";

export default function CartScreen() {
  const cart = useCartStore((s) => s.cart);
  const loading = useCartStore((s) => s.loading);
  const error = useCartStore((s) => s.error);
  const fetchCart = useCartStore((s) => s.fetch);

  // Le panier a pu changer ailleurs (site, autre téléphone) : on le relit à chaque visite.
  useFocusEffect(
    useCallback(() => {
      void fetchCart();
    }, [fetchCart]),
  );

  if (!cart && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }

  const items = cart?.items ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length ? styles.list : styles.listEmpty}
        renderItem={({ item }) => <CartLine item={item} />}
        refreshControl={<RefreshControl refreshing={loading && !!cart} onRefresh={fetchCart} tintColor={colors.orange} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={56} color={colors.border} />
            <Text style={styles.emptyTitle}>Votre panier est vide</Text>
            <Button label="Découvrir les produits" variant="secondary" onPress={() => router.navigate("/client")} />
          </View>
        }
      />

      {items.length > 0 ? (
        <View style={styles.summary}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total articles</Text>
            <Text style={styles.total}>{formatPrice(cart?.total_price ?? 0)}</Text>
          </View>
          <Text style={styles.note}>Frais de livraison calculés à l'étape suivante.</Text>
          <Button label="Finaliser sur le site" onPress={() => Linking.openURL(`${SITE_URL}/cart`)} />
          <Text style={styles.note}>
            La commande dans l'appli arrive bientôt. Connectez-vous sur le site avec le même numéro : votre panier y est
            déjà.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function CartLine({ item }: { item: CartItem }) {
  const update = useCartStore((s) => s.update);
  const remove = useCartStore((s) => s.remove);
  const pending = useCartStore((s) => s.pendingItemId === item.id);

  return (
    <View style={[styles.line, pending && styles.linePending]}>
      <View style={styles.lineInfo}>
        <Text style={styles.lineName} numberOfLines={2}>
          {item.product_name}
        </Text>
        <Text style={styles.lineUnit}>{formatPrice(item.unit_price)} l'unité</Text>
      </View>
      <View style={styles.lineActions}>
        <QuantityStepper size="sm" value={item.quantity} onChange={(q) => update(item.id, q)} disabled={pending} />
        <Text style={styles.lineSubtotal}>{formatPrice(item.subtotal)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retirer ${item.product_name} du panier`}
          onPress={() => remove(item.id)}
          disabled={pending}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.muted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1, justifyContent: "center", padding: 24 },
  error: { fontSize: 14, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 4 },
  empty: { alignItems: "center", gap: 14 },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  line: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  linePending: { opacity: 0.6 },
  lineInfo: { gap: 2 },
  lineName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  lineUnit: { fontSize: 13, color: colors.mutedForeground },
  lineActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineSubtotal: { flex: 1, textAlign: "right", fontSize: 15, fontWeight: "800", color: colors.ink },
  summary: { padding: 16, gap: 10, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  totalLabel: { fontSize: 15, color: colors.ink },
  total: { fontSize: 22, fontWeight: "800", color: colors.orange },
  note: { fontSize: 12, color: colors.mutedForeground, textAlign: "center" },
});
