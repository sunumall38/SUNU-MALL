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
        header={store ? <ShopHeader store={store} /> : undefined}
        emptyText="Cette boutique n'a pas encore de produit en vente."
      />
    </>
  );
}

function ShopHeader({ store }: { store: Store }) {
  const logo = mediaUrl(store.logo_url);
  const category = store.category_detail?.name ?? store.category_names[0];
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.logo}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImage} />
          ) : (
            <Text style={styles.initial}>{store.name.trim().charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{store.name}</Text>
            {store.is_verified_seller ? (
              <Ionicons name="checkmark-circle" size={17} color={colors.success} accessibilityLabel="Vendeur vérifié" />
            ) : null}
          </View>
          <Text style={styles.meta}>
            {[category, store.rating != null ? `★ ${store.rating.toFixed(1)} (${store.review_count} avis)` : null, store.city]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      {store.description ? <Text style={styles.description}>{store.description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 10, marginBottom: 16, ...shadow },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
  logoImage: { width: "100%", height: "100%" },
  initial: { fontSize: 24, fontWeight: "800", color: colors.white },
  body: { flex: 1, gap: 4 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontSize: 18, fontWeight: "800", color: colors.ink },
  meta: { fontSize: 13, color: colors.mutedForeground },
  description: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground },
});
