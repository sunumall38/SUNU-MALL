import { Stack, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { ProductGrid } from "@/components/ProductGrid";
import { listProducts } from "@/lib/catalog";
import { colors } from "@/theme";

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const category = Number(id);
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Catégorie" }} />
      <ProductGrid
        queryKey={`category:${id}`}
        fetchPage={(page) => listProducts({ page, category })}
        header={(count) => (
          <Text style={styles.count}>{count ? `${count} produit${count > 1 ? "s" : ""}` : ""}</Text>
        )}
        emptyText="Aucun produit dans cette catégorie pour le moment."
      />
    </>
  );
}

const styles = StyleSheet.create({
  count: { fontSize: 14, fontWeight: "700", color: colors.mutedForeground, marginBottom: 12 },
});
