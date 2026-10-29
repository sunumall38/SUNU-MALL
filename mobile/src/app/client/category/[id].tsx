import { Stack, useLocalSearchParams } from "expo-router";
import { ProductGrid } from "@/components/ProductGrid";
import { listProducts } from "@/lib/catalog";

export default function CategoryScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const category = Number(id);
  return (
    <>
      <Stack.Screen options={{ title: name ?? "Catégorie" }} />
      <ProductGrid
        queryKey={`category:${id}`}
        fetchPage={(page) => listProducts({ page, category })}
        emptyText="Aucun produit dans cette catégorie pour le moment."
      />
    </>
  );
}
