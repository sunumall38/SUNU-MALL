import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ProductRow } from "@/components/ProductCard";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { StoreRow } from "@/components/StoreRow";
import { categoryStyle } from "@/lib/categories";
import { listCategories, listProducts, listStores } from "@/lib/catalog";
import { usePaginated } from "@/lib/usePaginated";
import { colors, radius, shadow } from "@/theme";
import type { Category } from "@/types";

type Tab = "products" | "stores" | "categories";

const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Produits" },
  { id: "stores", label: "Boutiques" },
  { id: "categories", label: "Catégories" },
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ tab?: string; focus?: string }>();
  const [tab, setTab] = useState<Tab>("products");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  // Arrivée depuis l'accueil : onglet demandé, clavier ouvert sur la barre de recherche.
  useEffect(() => {
    if (params.tab === "categories" || params.tab === "stores" || params.tab === "products") setTab(params.tab);
    if (params.focus === "1") inputRef.current?.focus();
  }, [params.tab, params.focus]);

  // Recherche lancée 350 ms après la dernière frappe.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  function cancel() {
    setInput("");
    setQuery("");
    inputRef.current?.blur();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.top}>
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              ref={inputRef}
              value={input}
              onChangeText={setInput}
              placeholder={tab === "stores" ? "Rechercher une boutique…" : "Rechercher un produit…"}
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
              onSubmitEditing={() => setQuery(input.trim())}
              style={styles.input}
              accessibilityLabel="Rechercher"
            />
          </View>
          {input ? (
            <Pressable accessibilityRole="button" onPress={cancel} hitSlop={8}>
              <Text style={styles.cancel}>Annuler</Text>
            </Pressable>
          ) : null}
        </View>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
      </View>

      {tab === "products" ? <ProductResults query={query} /> : null}
      {tab === "stores" ? <StoreResults query={query} /> : null}
      {tab === "categories" ? <CategoryList query={query} /> : null}
    </SafeAreaView>
  );
}

function ProductResults({ query }: { query: string }) {
  const results = usePaginated(`products:${query}`, (page) => listProducts({ page, search: query || undefined }));
  return (
    <FlatList
      data={results.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <ProductRow product={item} />}
      onEndReached={results.loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        results.count != null ? (
          <Text style={styles.count}>
            {query ? `Résultats (${results.count})` : `Tous les produits (${results.count})`}
          </Text>
        ) : undefined
      }
      ListEmptyComponent={<ListState {...results} empty={`Aucun produit ne correspond à « ${query} ».`} />}
      ListFooterComponent={results.loadingMore ? <ActivityIndicator color={colors.orange} /> : undefined}
    />
  );
}

function StoreResults({ query }: { query: string }) {
  const results = usePaginated(`stores:${query}`, (page) => listStores({ page, search: query || undefined }));
  return (
    <FlatList
      data={results.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <StoreRow store={item} />}
      onEndReached={results.loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        results.count != null ? <Text style={styles.count}>Boutiques ({results.count})</Text> : undefined
      }
      ListEmptyComponent={<ListState {...results} empty={`Aucune boutique ne correspond à « ${query} ».`} />}
      ListFooterComponent={results.loadingMore ? <ActivityIndicator color={colors.orange} /> : undefined}
    />
  );
}

function CategoryList({ query }: { query: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setCategories(await listCategories());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (!categories) {
    return error ? (
      <View style={styles.state}>
        <Text style={styles.muted}>Impossible de charger les catégories.</Text>
        <Button label="Réessayer" variant="secondary" onPress={load} />
      </View>
    ) : (
      <ActivityIndicator color={colors.orange} style={styles.loader} />
    );
  }

  // Catégories principales seulement : chacune inclut les produits de ses sous-catégories.
  const needle = query.toLowerCase();
  const rows = categories.filter((c) => c.parent === null && (!needle || c.name.toLowerCase().includes(needle)));

  return (
    <FlatList
      data={rows}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const style = categoryStyle(item.name);
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/client/category/[id]", params: { id: String(item.id), name: item.name } })
            }
            style={styles.categoryRow}
          >
            <View style={[styles.categoryIcon, { backgroundColor: style.background }]}>
              <Ionicons name={style.icon} size={20} color={style.color} />
            </View>
            <Text style={styles.categoryName}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
          </Pressable>
        );
      }}
      ListEmptyComponent={<Text style={styles.muted}>Aucune catégorie ne correspond à « {query} ».</Text>}
    />
  );
}

function ListState({
  loading,
  error,
  retry,
  empty,
}: {
  loading: boolean;
  error: string | null;
  retry: () => unknown;
  empty: string;
}) {
  if (loading) return <ActivityIndicator color={colors.orange} style={styles.loader} />;
  if (error) {
    return (
      <View style={styles.state}>
        <Text style={styles.muted}>{error}</Text>
        <Button label="Réessayer" variant="secondary" onPress={retry} />
      </View>
    );
  }
  return <Text style={styles.muted}>{empty}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 14 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
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
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink },
  cancel: { fontSize: 15, color: colors.mutedForeground },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12, flexGrow: 1 },
  count: { fontSize: 16, fontWeight: "800", color: colors.ink, marginBottom: 2 },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 16 },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 12,
  },
  categoryIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  categoryName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
});
