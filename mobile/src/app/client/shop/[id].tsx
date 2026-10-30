import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { ProductGrid } from "@/components/ProductGrid";
import { getStore, listProducts } from "@/lib/catalog";
import { mediaUrl } from "@/lib/format";
import { colors, radius, shadow } from "@/theme";
import type { Store } from "@/types";

export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [store, setStore] = useState<Store | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStore(id)
      .then((s) => !cancelled && setStore(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <Stack.Screen options={{ title: store?.name ?? "" }} />
      <ProductGrid
        queryKey={`store:${id}`}
        fetchPage={(page) => listProducts({ page, store: id })}
        showStore={false}
        header={(count) => (
          <View style={styles.header}>
            {store ? <ShopHeader store={store} /> : null}
            <Text style={styles.sectionTitle}>Produits{count != null ? ` (${count})` : ""}</Text>
          </View>
        )}
        emptyText="Cette boutique n'a pas encore de produit en vente."
      />
    </>
  );
}

function ShopHeader({ store }: { store: Store }) {
  const logo = mediaUrl(store.logo_url);
  const banner = mediaUrl(store.banner_url);
  const category = store.category_detail?.name ?? store.category_names[0];
  return (
    <View style={styles.card}>
      {banner ? <Image source={{ uri: banner }} style={styles.banner} resizeMode="cover" /> : <View style={styles.bannerEmpty} />}
      <View style={styles.identity}>
        <View style={styles.logo}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImage} />
          ) : (
            <Text style={styles.initial}>{store.name.trim().charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{store.name}</Text>
          {store.is_verified_seller ? (
            <Ionicons name="checkmark-circle" size={18} color={colors.success} accessibilityLabel="Vendeur vérifié" />
          ) : null}
        </View>
        {category ? <Text style={styles.category}>{category}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {store.rating != null ? (
              <>
                <Text style={styles.star}>★</Text> {store.rating.toFixed(1)} ({store.review_count} avis)
              </>
            ) : (
              "Nouvelle boutique"
            )}
          </Text>
          {store.city ? (
            <View style={styles.city}>
              <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
              <Text style={styles.meta}>
                {[store.address, store.city].filter(Boolean).join(", ")}
              </Text>
            </View>
          ) : null}
        </View>
        {store.description ? <Text style={styles.description}>{store.description}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 14, marginBottom: 12 },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, overflow: "hidden", ...shadow },
  banner: { width: "100%", height: 110 },
  bannerEmpty: { height: 56, backgroundColor: colors.navy },
  identity: { alignItems: "center", gap: 4, paddingHorizontal: 16, paddingBottom: 16, marginTop: -36 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
    borderWidth: 3,
    borderColor: colors.white,
    marginBottom: 4,
  },
  logoImage: { width: "100%", height: "100%" },
  initial: { fontSize: 28, fontWeight: "800", color: colors.white },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: 20, fontWeight: "800", color: colors.ink, textAlign: "center" },
  category: { fontSize: 14, fontWeight: "600", color: colors.orangeDark },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", columnGap: 12, rowGap: 2 },
  meta: { fontSize: 13, color: colors.mutedForeground },
  star: { color: colors.orange },
  city: { flexDirection: "row", alignItems: "center", gap: 3 },
  description: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, textAlign: "center", marginTop: 6 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
});
