import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { displayPrice, productImage } from "@/lib/catalog";
import { formatPrice, mediaUrl } from "@/lib/format";
import { listMyProducts, PRODUCT_STATUS } from "@/lib/merchant";
import { usePaginated } from "@/lib/usePaginated";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";
import type { Product } from "@/types";

const GAP = 12;

export default function MerchantProductsScreen() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - GAP) / 2;
  const storeId = useMerchantStore((s) => s.store?.id ?? "");
  const account = useMerchantStore((s) => s.account);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const products = usePaginated(`mine:${storeId}:${query}`, (page) => listMyProducts(storeId, page, query || undefined));
  const firstFocus = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  // Retour d'un ajout ou d'une modification : la liste est relue.
  const { refresh } = products;
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void refresh();
    }, [refresh]),
  );

  const blocked = account?.product_limit === 0;
  const full = account != null && account.products_remaining === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Mes produits</Text>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Rechercher…"
            placeholderTextColor={colors.mutedForeground}
            style={styles.input}
            accessibilityLabel="Rechercher un produit"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked || full }}
          disabled={blocked || full}
          onPress={() => router.push("/merchant/product/new")}
          style={[styles.addButton, (blocked || full) && styles.disabled]}
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.addText}>Ajouter</Text>
        </Pressable>
      </View>
      {blocked ? (
        <Text style={styles.notice}>Pas d'abonnement actif : la création de produits est suspendue.</Text>
      ) : full ? (
        <Text style={styles.notice}>Vous avez atteint la limite de produits de votre abonnement.</Text>
      ) : null}

      <FlatList
        data={products.items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => <ProductTile product={item} width={cardWidth} />}
        onEndReached={products.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={products.refreshing} onRefresh={products.refresh} tintColor={colors.orange} />}
        ListEmptyComponent={
          products.loading ? (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          ) : products.error ? (
            <View style={styles.state}>
              <Text style={styles.muted}>{products.error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={products.retry} />
            </View>
          ) : (
            <Text style={styles.muted}>
              {query ? `Aucun produit ne correspond à « ${query} ».` : "Aucun produit. Touchez « Ajouter » pour créer le premier."}
            </Text>
          )
        }
        ListFooterComponent={products.loadingMore ? <ActivityIndicator color={colors.orange} /> : undefined}
      />
    </SafeAreaView>
  );
}

function ProductTile({ product, width }: { product: Product; width: number }) {
  const uri = mediaUrl(productImage(product));
  const status = PRODUCT_STATUS[product.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={() => router.push({ pathname: "/merchant/product/[id]", params: { id: product.id } })}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.imageBox, { height: width * 0.8 }]}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="cover" />
        ) : (
          <Ionicons name="image-outline" size={30} color={colors.mutedForeground} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.price}>{formatPrice(displayPrice(product))}</Text>
        <Badge label={status.label} color={status.color} background={status.background} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  toolbar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    ...shadow,
  },
  input: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.ink },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.orange,
    borderRadius: radius.md,
    paddingHorizontal: 14,
  },
  disabled: { opacity: 0.5 },
  addText: { fontSize: 15, fontWeight: "700", color: colors.white },
  notice: { marginHorizontal: 16, marginBottom: 12, fontSize: 13, color: colors.danger },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  column: { gap: GAP, marginBottom: GAP },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, overflow: "hidden", ...shadow },
  pressed: { opacity: 0.85 },
  imageBox: { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  image: { width: "100%", height: "100%" },
  body: { padding: 10, gap: 4 },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink },
  price: { fontSize: 14, fontWeight: "800", color: colors.ink },
});
