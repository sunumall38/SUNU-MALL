import type { ReactElement } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Button } from "@/components/Button";
import { ProductCard } from "@/components/ProductCard";
import { usePaginated } from "@/lib/usePaginated";
import { colors } from "@/theme";
import type { Paginated, Product } from "@/types";

const GAP = 12;

/** Grille de produits paginée (catégorie). */
export function ProductGrid({
  queryKey,
  fetchPage,
  header,
  emptyText,
}: {
  queryKey: string;
  fetchPage: (page: number) => Promise<Paginated<Product>>;
  /** En-tête ; reçoit le nombre total de produits (null tant qu'il est inconnu). */
  header?: (count: number | null) => ReactElement;
  emptyText: string;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - GAP) / 2;
  const products = usePaginated(queryKey, fetchPage);

  return (
    <FlatList
      data={products.items}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      onEndReached={products.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={products.refreshing} onRefresh={products.refresh} tintColor={colors.orange} />}
      ListHeaderComponent={header?.(products.count)}
      ListEmptyComponent={
        products.loading ? (
          <ActivityIndicator color={colors.orange} style={styles.loader} />
        ) : products.error ? (
          <View style={styles.state}>
            <Text style={styles.muted}>{products.error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={products.retry} />
          </View>
        ) : (
          <Text style={styles.muted}>{emptyText}</Text>
        )
      }
      ListFooterComponent={products.loadingMore ? <ActivityIndicator color={colors.orange} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 24 },
  column: { gap: GAP, marginBottom: GAP },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
});
