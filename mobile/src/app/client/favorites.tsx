import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, StyleSheet, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState, LoginPrompt } from "@/components/EmptyState";
import { ProductTile } from "@/components/ProductCard";
import { useAuthStore } from "@/store/auth";
import { useWishlistStore } from "@/store/wishlist";
import { colors } from "@/theme";

const GAP = 12;

export default function FavoritesScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  if (!signedIn) {
    return <LoginPrompt icon="heart-outline" title="Mes favoris" text="Connectez-vous pour retrouver vos produits favoris." />;
  }
  return <FavoriteGrid />;
}

function FavoriteGrid() {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - GAP) / 2;
  const wishlist = useWishlistStore((s) => s.wishlist);
  const loading = useWishlistStore((s) => s.loading);
  const fetchWishlist = useWishlistStore((s) => s.fetch);

  useFocusEffect(
    useCallback(() => {
      void fetchWishlist();
    }, [fetchWishlist]),
  );

  if (!wishlist && loading) return <ActivityIndicator size="large" color={colors.orange} style={styles.loader} />;

  return (
    <FlatList
      data={wishlist?.items ?? []}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <ProductTile
          width={cardWidth}
          productId={item.product}
          name={item.product_name}
          price={item.product_price}
          image={item.product_image}
        />
      )}
      ListEmptyComponent={
        <EmptyState icon="heart-outline" title="Aucun favori" text="Touchez le cœur d'un produit pour le retrouver ici.">
          <Button label="Découvrir les produits" variant="secondary" onPress={() => router.dismissTo("/client")} />
        </EmptyState>
      }
    />
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 48 },
  list: { padding: 16, flexGrow: 1 },
  column: { gap: GAP, marginBottom: GAP },
});
