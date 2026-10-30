import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { FavoriteButton } from "@/components/FavoriteButton";
import { QuantityStepper } from "@/components/QuantityStepper";
import { ApiError, apiErrorMessage } from "@/lib/api";
import { getProduct, variantLabel } from "@/lib/catalog";
import { formatPrice, mediaUrl } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { useCartStore } from "@/store/cart";
import { useCheckoutStore } from "@/store/checkout";
import { colors, radius, shadow } from "@/theme";
import type { Product } from "@/types";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProduct(await getProduct(id));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? "Ce produit n'existe pas ou a été retiré de la vente."
          : apiErrorMessage(err, "Impossible de charger ce produit."),
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || error || !product) {
    return (
      <SafeAreaView style={styles.center}>
        <BackButton />
        {loading ? (
          <ActivityIndicator size="large" color={colors.orange} />
        ) : (
          <>
            <Text style={styles.muted}>{error ?? "Produit introuvable."}</Text>
            <Button label="Réessayer" variant="secondary" onPress={load} />
          </>
        )}
      </SafeAreaView>
    );
  }
  return <ProductDetail product={product} />;
}

function BackButton() {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retour"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/client"))}
      style={[styles.roundButton, styles.back, { top: insets.top + 8 }]}
    >
      <Ionicons name="arrow-back" size={22} color={colors.ink} />
    </Pressable>
  );
}

function ProductDetail({ product }: { product: Product }) {
  const insets = useSafeAreaInsets();
  const signedIn = useAuthStore((s) => s.user !== null);
  const addToCart = useCartStore((s) => s.add);
  const cartError = useCartStore((s) => s.error);
  const clearCartError = useCartStore((s) => s.clearError);
  const startCheckout = useCheckoutStore((s) => s.start);
  const [variantId, setVariantId] = useState(
    (product.variants.find((v) => v.is_available) ?? product.variants[0])?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState<"add" | "buy" | null>(null);
  const [added, setAdded] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const available = variant?.is_available ?? false;
  const maxQuantity = Math.max(1, Math.min(variant?.quantity ?? 1, 99));

  useEffect(() => {
    // Erreur d'un précédent ajout : ne pas l'afficher sur une autre fiche.
    clearCartError();
  }, [clearCartError]);

  function selectVariant(id: string) {
    setVariantId(id);
    setQuantity(1);
    setAdded(false);
  }

  async function add(mode: "add" | "buy") {
    if (!variant) return;
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(mode);
    setAdded(false);
    const ok = await addToCart(variant.id, quantity);
    setBusy(null);
    if (!ok) return;
    if (mode === "add") {
      setAdded(true);
      return;
    }
    // Achat immédiat : on commande cet article seul (le reste du panier attend).
    const line = useCartStore.getState().cart?.items.find((item) => item.product_variant === variant.id);
    if (line) {
      startCheckout([line]);
      router.push("/client/checkout");
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.galleryBox, { paddingTop: insets.top + 56 }]}>
          <Gallery product={product} />
        </View>

        <View style={styles.body}>
          <Text style={styles.name}>{product.name}</Text>
          <Text style={styles.price}>{formatPrice(variant?.price ?? product.base_price)}</Text>
          {variant ? (
            <View style={styles.stockRow}>
              <View style={[styles.stockDot, { backgroundColor: available ? colors.success : colors.danger }]} />
              <Text style={[styles.stock, { color: available ? colors.success : colors.danger }]}>
                {available ? "En stock" : "Rupture de stock"}
              </Text>
            </View>
          ) : (
            <Text style={styles.warning}>Ce produit n'est pas encore disponible à la vente.</Text>
          )}

          <View style={styles.infoRow}>
            <View style={styles.infoCard}>
              <Ionicons name="bicycle-outline" size={20} color={colors.success} />
              <Text style={styles.infoText}>
                Livraison à domicile{"\n"}
                <Text style={styles.infoMuted}>ou retrait en boutique</Text>
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/client/shop/[id]", params: { id: product.store } })}
              style={styles.infoCard}
            >
              <Ionicons name="storefront-outline" size={20} color={colors.navy} />
              <Text style={styles.infoText} numberOfLines={2}>
                <Text style={styles.infoMuted}>Vendu par{"\n"}</Text>
                {product.store_name}
                {product.store_is_verified ? " ✓" : ""}
              </Text>
            </Pressable>
          </View>

          {product.variants.length > 1 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Variantes</Text>
              <View style={styles.chips}>
                {product.variants.map((v, index) => {
                  const selected = v.id === variant?.id;
                  return (
                    <Pressable
                      key={v.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectVariant(v.id)}
                      style={[styles.chip, selected && styles.chipSelected, !v.is_available && styles.chipUnavailable]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{variantLabel(v, index)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {available ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quantité</Text>
              <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{product.description || "Aucune description fournie."}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.topButtons, { top: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/client"))}
          style={styles.roundButton}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <FavoriteButton productId={product.id} size={20} />
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        {cartError ? <Text style={styles.error}>{cartError}</Text> : null}
        {added ? (
          <View style={styles.addedRow}>
            <Text style={styles.added}>✓ Ajouté au panier</Text>
            <Pressable onPress={() => router.dismissTo("/client/cart")} hitSlop={8}>
              <Text style={styles.link}>Voir le panier</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button
            label="Ajouter au panier"
            variant="secondary"
            onPress={() => add("add")}
            loading={busy === "add"}
            disabled={!variant || !available || busy !== null}
            style={styles.action}
          />
          <Button
            label="Acheter maintenant"
            onPress={() => add("buy")}
            loading={busy === "buy"}
            disabled={!variant || !available || busy !== null}
            style={styles.action}
          />
        </View>
      </View>
    </View>
  );
}

function Gallery({ product }: { product: Product }) {
  const { width } = useWindowDimensions();
  const size = width - 32;
  const [index, setIndex] = useState(0);
  const images = product.images.map((img) => mediaUrl(img.url)).filter((url): url is string => Boolean(url));

  if (images.length === 0) {
    return (
      <View style={[styles.imagePlaceholder, { width: size, height: size * 0.85 }]}>
        <Ionicons name="image-outline" size={48} color={colors.mutedForeground} />
      </View>
    );
  }

  return (
    <View>
      <FlatList
        data={images}
        keyExtractor={(url, i) => `${i}-${url}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / size))}
        // Hauteur fixe : sans elle, la liste horizontale s'étire sur tout l'écran (iOS).
        style={{ width: size, height: size * 0.85, flexGrow: 0, borderRadius: radius.lg }}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width: size, height: size * 0.85 }} resizeMode="contain" accessibilityLabel={product.name} />
        )}
      />
      {images.length > 1 ? (
        <>
          <Text style={styles.counter}>
            {index + 1}/{images.length}
          </Text>
          <View style={styles.dots}>
            {images.map((url, i) => (
              <View key={`${i}-${url}`} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background },
  muted: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  scroll: { paddingBottom: 24 },
  galleryBox: {
    alignItems: "center",
    paddingBottom: 16,
    backgroundColor: colors.muted,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.white, borderRadius: radius.lg },
  counter: {
    position: "absolute",
    right: 10,
    bottom: 30,
    fontSize: 12,
    fontWeight: "700",
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.orange, width: 18 },
  topButtons: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadow,
  },
  back: { position: "absolute", left: 16 },
  body: { padding: 16, gap: 8 },
  name: { fontSize: 22, fontWeight: "800", color: colors.ink },
  price: { fontSize: 26, fontWeight: "800", color: colors.ink },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stockDot: { width: 9, height: 9, borderRadius: 5 },
  stock: { fontSize: 14, fontWeight: "700" },
  warning: { fontSize: 15, fontWeight: "700", color: colors.danger },
  infoRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  infoCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: colors.white,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.ink },
  infoMuted: { fontWeight: "400", color: colors.mutedForeground },
  section: { gap: 8, marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  chipSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  chipUnavailable: { opacity: 0.5 },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  chipTextSelected: { color: colors.orange },
  description: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    ...shadow,
  },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1 },
  error: { fontSize: 14, color: colors.danger },
  addedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  added: { fontSize: 14, fontWeight: "600", color: colors.success },
  link: { fontSize: 14, fontWeight: "700", color: colors.orange },
});
