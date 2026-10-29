import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { apiErrorMessage, apiGet } from "@/lib/api";
import { formatPrice, mediaUrl } from "@/lib/format";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";
import type { Paginated, Product } from "@/types";

/** Accueil client : catalogue paginé, branché sur l'API réelle. */
export default function ClientHome() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage: number) => {
    setError(null);
    try {
      const data = await apiGet<Paginated<Product>>(`/catalog/products/?page=${targetPage}`);
      setProducts((prev) => (targetPage === 1 ? data.results : [...prev, ...data.results]));
      setPage(targetPage);
      setHasMore(Boolean(data.next));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les produits."));
    }
  }, []);

  useEffect(() => {
    void load(1).finally(() => setLoading(false));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(1);
    setRefreshing(false);
  }

  function loadMore() {
    if (loading || refreshing || !hasMore || error) return;
    setLoading(true);
    void load(page + 1).finally(() => setLoading(false));
  }

  function retryMore() {
    setLoading(true);
    void load(page + 1).finally(() => setLoading(false));
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>
            Sunu<Text style={styles.brandAccent}>Mall</Text>
          </Text>
          <Text style={styles.greeting}>Bonjour {user?.first_name || "et bienvenue"} 👋</Text>
        </View>
        <Pressable onPress={() => void logout()} accessibilityRole="button">
          <Text style={styles.logout}>Déconnexion</Text>
        </Pressable>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ProductCard product={item} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
        ListHeaderComponent={<Text style={styles.section}>Produits</Text>}
        ListEmptyComponent={
          loading ? undefined : error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>{error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={refresh} />
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={styles.stateText}>Aucun produit pour le moment.</Text>
            </View>
          )
        }
        ListFooterComponent={
          loading ? (
            <ActivityIndicator style={styles.footer} color={colors.orange} />
          ) : error && products.length > 0 ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>{error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={retryMore} />
            </View>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function ProductCard({ product }: { product: Product }) {
  const image = mediaUrl(product.images[0]?.url);
  return (
    <View style={styles.card}>
      {image ? (
        <Image source={{ uri: image }} style={styles.image} resizeMode="cover" accessibilityLabel={product.name} />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={styles.cardBody}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.store} numberOfLines={1}>
          {product.store_name}
        </Text>
        <Text style={styles.price}>{formatPrice(product.base_price)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.muted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { fontSize: 22, fontWeight: "800", color: colors.navy },
  brandAccent: { color: colors.orange },
  greeting: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  logout: { fontSize: 14, fontWeight: "600", color: colors.orange },
  list: { padding: 16, gap: 12 },
  row: { gap: 12 },
  section: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  image: { width: "100%", aspectRatio: 1, backgroundColor: colors.muted },
  imagePlaceholder: { backgroundColor: colors.accent },
  cardBody: { padding: 10, gap: 2 },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink },
  store: { fontSize: 12, color: colors.mutedForeground },
  price: { fontSize: 15, fontWeight: "800", color: colors.orange, marginTop: 4 },
  state: { alignItems: "center", gap: 12, paddingVertical: 48 },
  stateText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  footer: { marginVertical: 16 },
});
