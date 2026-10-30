import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { openProduct, ProductCard } from "@/components/ProductCard";
import { categoryStyle } from "@/lib/categories";
import { listBestSellers, listCategories, listProducts, listSponsoredProducts, productImage } from "@/lib/catalog";
import { mediaUrl } from "@/lib/format";
import { usePaginated } from "@/lib/usePaginated";
import { useAuthStore } from "@/store/auth";
import { cartItemCount, useCartStore } from "@/store/cart";
import { colors, radius, shadow } from "@/theme";
import type { Category, Product } from "@/types";

const GAP = 12;
const PADDING = 16;

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - PADDING * 2 - GAP) / 2;
  const products = usePaginated("home", (page) => listProducts({ page }));
  const [sectionsKey, setSectionsKey] = useState(0);

  const refresh = useCallback(() => {
    setSectionsKey((k) => k + 1);
    void products.refresh();
  }, [products]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={products.items}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
        onEndReached={products.loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={products.refreshing} onRefresh={refresh} tintColor={colors.orange} />
        }
        ListHeaderComponent={<HomeHeader reloadKey={sectionsKey} />}
        ListEmptyComponent={
          products.loading ? (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          ) : products.error ? (
            <View style={styles.errorBox}>
              <Text style={styles.muted}>{products.error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={products.retry} />
            </View>
          ) : (
            <Text style={styles.muted}>Aucun produit en vente pour le moment.</Text>
          )
        }
        ListFooterComponent={
          products.loadingMore ? (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          ) : products.error && products.items.length > 0 ? (
            <Pressable onPress={products.retry} style={styles.footerRetry}>
              <Text style={styles.link}>Impossible de charger la suite. Réessayer</Text>
            </Pressable>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function HomeHeader({ reloadKey }: { reloadKey: number }) {
  const signedIn = useAuthStore((s) => s.user !== null);
  const cartCount = useCartStore((s) => cartItemCount(s.cart));
  const [categories, setCategories] = useState<Category[]>([]);
  const [sponsored, setSponsored] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;
    // Sections facultatives : une erreur les masque sans bloquer l'accueil.
    listCategories()
      .then((all) => !cancelled && setCategories(all.filter((c) => c.parent === null)))
      .catch(() => undefined);
    listSponsoredProducts()
      .then((list) => !cancelled && setSponsored(list))
      .catch(() => undefined);
    listBestSellers()
      .then((list) => !cancelled && setBestSellers(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const featured = sponsored[0];
  const featuredImage = featured ? mediaUrl(productImage(featured)) : null;

  return (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <Logo size={30} />
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={8}
            onPress={() => router.push(signedIn ? "/client/notifications" : "/login")}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.ink} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Panier, ${cartCount} article${cartCount > 1 ? "s" : ""}`}
            hitSlop={8}
            onPress={() => router.navigate("/client/cart")}
          >
            <Ionicons name="cart-outline" size={25} color={colors.ink} />
            {cartCount > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="search"
        onPress={() => router.navigate({ pathname: "/client/search", params: { focus: "1" } })}
        style={styles.searchBar}
      >
        <Ionicons name="search" size={18} color={colors.orange} />
        <Text style={styles.searchPlaceholder}>Rechercher un produit, une boutique…</Text>
      </Pressable>

      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>
            Tout le Sénégal{"\n"}
            <Text style={styles.heroAccent}>dans une seule plateforme</Text>
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/client/shops")} style={styles.pill}>
            <Text style={styles.pillText}>Découvrir</Text>
          </Pressable>
        </View>
        <Image source={require("../../../../assets/hero.png")} style={styles.heroImage} resizeMode="contain" />
      </View>

      {categories.length > 0 ? (
        <>
          <SectionTitle
            title="Catégories"
            onSeeAll={() => router.navigate({ pathname: "/client/search", params: { tab: "categories" } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.categories}>
            {categories.map((category) => {
              const style = categoryStyle(category.name);
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/client/category/[id]",
                      params: { id: String(category.id), name: category.name },
                    })
                  }
                  style={styles.category}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: style.background }]}>
                    <Ionicons name={style.icon} size={26} color={style.color} />
                  </View>
                  <Text style={styles.categoryLabel} numberOfLines={2}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {featured ? (
        <>
          <SectionTitle title="Promotions" />
          <Pressable accessibilityRole="button" onPress={() => openProduct(featured.id)} style={styles.promo}>
            <View style={styles.heroText}>
              <Text style={styles.promoTitle}>Sélection du moment</Text>
              <Text style={styles.promoText} numberOfLines={2}>
                {featured.name}
              </Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>Découvrir</Text>
              </View>
            </View>
            {featuredImage ? <Image source={{ uri: featuredImage }} style={styles.promoImage} /> : null}
          </Pressable>
        </>
      ) : null}

      {bestSellers.length >= 2 ? (
        <>
          <SectionTitle title="Produits populaires" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.noGrow} contentContainerStyle={styles.carousel}>
            {bestSellers.map((product) => (
              <ProductCard key={product.id} product={product} width={150} />
            ))}
          </ScrollView>
        </>
      ) : null}

      <SectionTitle title="Nouveautés" />
    </View>
  );
}

function SectionTitle({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      {onSeeAll ? (
        <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Voir tout</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: PADDING, paddingBottom: 24 },
  column: { gap: GAP, marginBottom: GAP },
  loader: { marginVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 16 },
  errorBox: { gap: 12, alignItems: "center" },
  footerRetry: { alignItems: "center", paddingVertical: 16 },
  link: { fontSize: 14, fontWeight: "700", color: colors.orange },
  header: { gap: 14, paddingTop: 8, paddingBottom: 4 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  dot: {
    position: "absolute",
    top: -1,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.orange,
    borderWidth: 2,
    borderColor: colors.background,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...shadow,
  },
  searchPlaceholder: { fontSize: 14, color: colors.mutedForeground },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.navy,
    borderRadius: radius.lg,
    padding: 18,
    minHeight: 150,
    overflow: "hidden",
  },
  heroText: { flex: 1, gap: 14, zIndex: 1 },
  heroTitle: { fontSize: 19, lineHeight: 25, fontWeight: "800", color: colors.white },
  heroAccent: { color: colors.orange },
  heroImage: { width: "48%", height: 120, marginRight: -12 },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: colors.orange,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  pillText: { fontSize: 14, fontWeight: "700", color: colors.white },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  sectionText: { fontSize: 18, fontWeight: "800", color: colors.ink },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, color: colors.mutedForeground },
  categories: { gap: 14, paddingRight: PADDING },
  category: { width: 72, alignItems: "center", gap: 6 },
  categoryIcon: { width: 62, height: 62, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  categoryLabel: { fontSize: 12, color: colors.ink, textAlign: "center" },
  promo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#B4460C",
    borderRadius: radius.lg,
    padding: 18,
    minHeight: 140,
  },
  promoTitle: { fontSize: 20, fontWeight: "800", color: colors.white },
  promoText: { fontSize: 13, color: "#FFE4CC" },
  promoImage: { width: 110, height: 110, borderRadius: radius.md },
  carousel: { gap: GAP, paddingRight: PADDING, paddingBottom: 4 },
  // Liste horizontale : pas d'étirement vertical (iOS).
  noGrow: { flexGrow: 0 },
});
