import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { StoreRow } from "@/components/StoreRow";
import { listStores } from "@/lib/catalog";
import { usePaginated } from "@/lib/usePaginated";
import { colors, radius, shadow } from "@/theme";

/** Annuaire des boutiques actives, avec recherche par nom. */
export default function ShopsScreen() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const stores = usePaginated(`stores:${query}`, (page) => listStores({ page, search: query || undefined }));

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  return (
    <FlatList
      data={stores.items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <StoreRow store={item} />}
      onEndReached={stores.loadMore}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Rechercher une boutique…"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            style={styles.input}
            accessibilityLabel="Rechercher une boutique"
          />
        </View>
      }
      ListEmptyComponent={
        stores.loading ? (
          <ActivityIndicator color={colors.orange} style={styles.loader} />
        ) : stores.error ? (
          <View style={styles.state}>
            <Text style={styles.muted}>{stores.error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={stores.retry} />
          </View>
        ) : (
          <Text style={styles.muted}>{query ? `Aucune boutique ne correspond à « ${query} ».` : "Aucune boutique pour le moment."}</Text>
        )
      }
      ListFooterComponent={stores.loadingMore ? <ActivityIndicator color={colors.orange} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    ...shadow,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
});
