import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { EmptyState, LoginPrompt } from "@/components/EmptyState";
import { openProduct } from "@/components/ProductCard";
import { QuantityStepper } from "@/components/QuantityStepper";
import { formatPrice, mediaUrl } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { cartItemCount, useCartStore } from "@/store/cart";
import { useCheckoutStore } from "@/store/checkout";
import { colors, radius, shadow } from "@/theme";
import type { CartItem } from "@/types";

export default function CartScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {signedIn ? (
        <SignedInCart />
      ) : (
        <LoginPrompt
          icon="cart-outline"
          title="Votre panier"
          text="Connectez-vous pour ajouter des articles et passer commande. Votre panier est le même que sur le site."
        />
      )}
    </SafeAreaView>
  );
}

function SignedInCart() {
  const cart = useCartStore((s) => s.cart);
  const loading = useCartStore((s) => s.loading);
  const error = useCartStore((s) => s.error);
  const fetchCart = useCartStore((s) => s.fetch);
  const updating = useCartStore((s) => s.pendingItemId !== null);
  const startCheckout = useCheckoutStore((s) => s.start);

  // Le panier a pu changer ailleurs (site, autre téléphone) : on le relit à chaque visite.
  useFocusEffect(
    useCallback(() => {
      void fetchCart();
    }, [fetchCart]),
  );

  if (!cart && loading) {
    return <ActivityIndicator size="large" color={colors.orange} style={styles.loader} />;
  }

  const items = cart?.items ?? [];
  const count = cartItemCount(cart);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>Mon panier</Text>
        <Text style={styles.subtitle}>
          {count} article{count > 1 ? "s" : ""}
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length ? styles.list : styles.listEmpty}
        renderItem={({ item }) => <CartLine item={item} />}
        refreshControl={<RefreshControl refreshing={loading && !!cart} onRefresh={fetchCart} tintColor={colors.orange} />}
        ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : undefined}
        ListEmptyComponent={
          <EmptyState icon="cart-outline" title="Votre panier est vide" text="Ajoutez des produits depuis l'accueil ou la recherche.">
            <Button label="Découvrir les produits" variant="secondary" onPress={() => router.navigate("/client")} />
          </EmptyState>
        }
      />

      {items.length > 0 ? (
        <View style={styles.summary}>
          <Row label="Sous-total" value={formatPrice(cart?.total_price ?? 0)} />
          <Row label="Livraison" value="Calculée à l'étape suivante" />
          <View style={styles.divider} />
          <Row label="Total" value={formatPrice(cart?.total_price ?? 0)} strong />
          <Button
            label="Passer la commande"
            disabled={updating}
            onPress={() => {
              startCheckout(items);
              router.push("/client/checkout");
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function CartLine({ item }: { item: CartItem }) {
  const update = useCartStore((s) => s.update);
  const remove = useCartStore((s) => s.remove);
  const pending = useCartStore((s) => s.pendingItemId === item.id);
  const image = mediaUrl(item.product_image);
  const productId = item.product;

  return (
    <View style={[styles.line, pending && styles.linePending]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.product_name}
        disabled={!productId}
        onPress={() => productId && openProduct(productId)}
        style={styles.thumb}
      >
        {image ? (
          <Image source={{ uri: image }} style={styles.thumbImage} />
        ) : (
          <Ionicons name="image-outline" size={26} color={colors.mutedForeground} />
        )}
      </Pressable>
      <View style={styles.lineBody}>
        <Text style={styles.lineName} numberOfLines={2}>
          {item.product_name}
        </Text>
        <Text style={styles.linePrice}>{formatPrice(item.unit_price)}</Text>
        <View style={styles.lineActions}>
          <QuantityStepper size="sm" value={item.quantity} onChange={(q) => update(item.id, q)} disabled={pending} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retirer ${item.product_name} du panier`}
            onPress={() => remove(item.id)}
            disabled={pending}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={strong ? styles.rowStrong : styles.rowLabel}>{label}</Text>
      <Text style={strong ? styles.rowStrong : styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loader: { marginTop: 48 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 13, color: colors.mutedForeground },
  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1 },
  error: { fontSize: 14, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 4 },
  line: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 12,
    ...shadow,
  },
  linePending: { opacity: 0.6 },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: radius.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
  thumbImage: { width: "100%", height: "100%" },
  lineBody: { flex: 1, gap: 4 },
  lineName: { fontSize: 15, fontWeight: "600", color: colors.ink },
  linePrice: { fontSize: 15, fontWeight: "800", color: colors.ink },
  lineActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  summary: {
    padding: 16,
    gap: 10,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rowLabel: { fontSize: 14, color: colors.mutedForeground },
  rowValue: { fontSize: 14, color: colors.ink },
  rowStrong: { fontSize: 17, fontWeight: "800", color: colors.ink },
  divider: { height: 1, backgroundColor: colors.border },
});
