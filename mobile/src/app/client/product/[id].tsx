import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { QuantityStepper } from "@/components/QuantityStepper";
import { ApiError, apiErrorMessage } from "@/lib/api";
import { getProduct, variantLabel } from "@/lib/catalog";
import { formatPrice, mediaUrl } from "@/lib/format";
import { useCartStore } from "@/store/cart";
import { colors } from "@/theme";
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.orange} />
      </View>
    );
  }
  if (error || !product) {
    return (
      <View style={[styles.center, styles.centerGap]}>
        <Text style={styles.muted}>{error ?? "Produit introuvable."}</Text>
        <Button label="Réessayer" variant="secondary" onPress={load} />
      </View>
    );
  }
  return <ProductDetail product={product} />;
}

function ProductDetail({ product }: { product: Product }) {
  const addToCart = useCartStore((s) => s.add);
  const cartError = useCartStore((s) => s.error);
  const clearCartError = useCartStore((s) => s.clearError);
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
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

  async function add() {
    if (!variant) return;
    setAdding(true);
    setAdded(false);
    setAdded(await addToCart(variant.id, quantity));
    setAdding(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gallery product={product} />

        <View style={styles.body}>
          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.storeRow}>
            <Ionicons name="storefront-outline" size={16} color={colors.mutedForeground} />
            <Text style={styles.store}>{product.store_name}</Text>
            {product.store_is_verified ? (
              <Ionicons name="checkmark-circle" size={16} color="#16A34A" accessibilityLabel="Vendeur vérifié" />
            ) : null}
          </View>
          <Text style={styles.price}>{formatPrice(variant?.price ?? product.base_price)}</Text>

          {product.variants.length > 1 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Choisir</Text>
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

          {!variant ? (
            <Text style={styles.warning}>Ce produit n'est pas encore disponible à la vente.</Text>
          ) : !available ? (
            <Text style={styles.warning}>Rupture de stock</Text>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Quantité</Text>
              <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>{product.description || "Aucune description fournie."}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {cartError ? <Text style={styles.error}>{cartError}</Text> : null}
        {added ? (
          <View style={styles.addedRow}>
            <Text style={styles.added}>✓ Ajouté au panier</Text>
            <Pressable onPress={() => router.navigate("/client/cart")}>
              <Text style={styles.link}>Voir le panier</Text>
            </Pressable>
          </View>
        ) : null}
        <Button label="Ajouter au panier" onPress={add} loading={adding} disabled={!variant || !available} />
      </View>
    </SafeAreaView>
  );
}

function Gallery({ product }: { product: Product }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const images = product.images.map((img) => mediaUrl(img.url)).filter((url): url is string => Boolean(url));

  if (images.length === 0) {
    return (
      <View style={[styles.imagePlaceholder, { width, height: width }]}>
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
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <Image source={{ uri: item }} style={{ width, height: width }} resizeMode="cover" accessibilityLabel={product.name} />
        )}
      />
      {images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((url, i) => (
            <View key={`${i}-${url}`} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.white },
  centerGap: { gap: 12 },
  muted: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  scroll: { paddingBottom: 24 },
  imagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.accent },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.orange, width: 18 },
  body: { padding: 16, gap: 8 },
  name: { fontSize: 22, fontWeight: "800", color: colors.ink },
  storeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  store: { fontSize: 14, color: colors.mutedForeground },
  price: { fontSize: 26, fontWeight: "800", color: colors.orange, marginTop: 4 },
  section: { gap: 8, marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  chipSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  chipUnavailable: { opacity: 0.5 },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  chipTextSelected: { color: colors.orange },
  warning: { fontSize: 15, fontWeight: "700", color: colors.danger, marginTop: 12 },
  description: { fontSize: 15, lineHeight: 22, color: colors.ink },
  bottomBar: { padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  error: { fontSize: 14, color: colors.danger },
  addedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  added: { fontSize: 14, fontWeight: "600", color: "#16A34A" },
  link: { fontSize: 14, fontWeight: "700", color: colors.orange },
});
