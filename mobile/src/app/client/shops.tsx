import Ionicons from "@expo/vector-icons/Ionicons";
import * as Location from "expo-location";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { StoreRow } from "@/components/StoreRow";
import { apiErrorMessage } from "@/lib/api";
import { listAllStores } from "@/lib/catalog";
import { colors, radius, shadow } from "@/theme";
import type { Store } from "@/types";

type Tab = "popular" | "nearby" | "categories";

const TABS: { id: Tab; label: string }[] = [
  { id: "popular", label: "Populaires" },
  { id: "nearby", label: "Proches" },
  { id: "categories", label: "Catégories" },
];

type Position = { latitude: number; longitude: number };

/** Distance à vol d'oiseau en km. */
function distanceKm(from: Position, store: Store) {
  if (store.latitude == null || store.longitude == null) return null;
  const lat = Number(store.latitude);
  const lng = Number(store.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(lat - from.latitude);
  const dLng = rad(lng - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.latitude)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function storeCategory(store: Store) {
  return store.category_detail?.name ?? store.category_names[0] ?? "Autres";
}

/** Annuaire des boutiques : populaires, proches de moi, par catégorie. */
export default function ShopsScreen() {
  const [tab, setTab] = useState<Tab>("popular");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [stores, setStores] = useState<Store[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStores(await listAllStores(query || undefined));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les boutiques."));
    }
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const locate = useCallback(async () => {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError("Autorisez la localisation pour voir les boutiques autour de vous.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosition({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    } catch {
      setLocationError("Position introuvable. Vérifiez que la localisation est activée.");
    } finally {
      setLocating(false);
    }
  }, []);

  // « Proches » demande la position une seule fois, à la première ouverture.
  useEffect(() => {
    if (tab === "nearby" && !position && !locating && !locationError) void locate();
  }, [tab, position, locating, locationError, locate]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const categories = useMemo(
    () => Array.from(new Set((stores ?? []).map(storeCategory))).sort((a, b) => a.localeCompare(b, "fr")),
    [stores],
  );

  const rows = useMemo(() => {
    const list = (stores ?? []).map((store) => ({ store, distance: position ? distanceKm(position, store) : null }));
    if (tab === "popular") {
      return list.sort(
        (a, b) =>
          (b.store.rating ?? -1) - (a.store.rating ?? -1) ||
          b.store.review_count - a.store.review_count ||
          a.store.name.localeCompare(b.store.name, "fr"),
      );
    }
    if (tab === "nearby") {
      // Boutiques sans position GPS à la fin.
      return list.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
    }
    return list
      .filter((row) => !category || storeCategory(row.store) === category)
      .sort((a, b) => a.store.name.localeCompare(b.store.name, "fr"));
  }, [stores, position, tab, category]);

  const header = (
    <View style={styles.header}>
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
      <SegmentedTabs options={TABS} value={tab} onChange={setTab} />

      {tab === "nearby" ? (
        locating ? (
          <View style={styles.infoRow}>
            <ActivityIndicator color={colors.orange} />
            <Text style={styles.info}>Recherche de votre position…</Text>
          </View>
        ) : locationError ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{locationError}</Text>
            <Pressable accessibilityRole="button" onPress={locate} hitSlop={8}>
              <Text style={styles.link}>Réessayer</Text>
            </Pressable>
          </View>
        ) : position ? (
          <Text style={styles.info}>Les plus proches de vous en premier.</Text>
        ) : null
      ) : null}

      {tab === "categories" && categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[null, ...categories].map((name) => {
            const selected = name === category;
            return (
              <Pressable
                key={name ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCategory(name)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{name ?? "Toutes"}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {stores ? (
        <Text style={styles.count}>
          {rows.length} boutique{rows.length > 1 ? "s" : ""}
        </Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.store.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
      renderItem={({ item }) => <StoreRow store={item.store} distanceKm={tab === "nearby" ? item.distance : null} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !stores ? (
          error ? (
            <View style={styles.state}>
              <Text style={styles.muted}>{error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={load} />
            </View>
          ) : (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          )
        ) : (
          <Text style={styles.muted}>
            {query ? `Aucune boutique ne correspond à « ${query} ».` : "Aucune boutique pour le moment."}
          </Text>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  header: { gap: 12, paddingTop: 4 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    ...shadow,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: colors.ink },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  info: { fontSize: 13, color: colors.mutedForeground },
  notice: { gap: 4, backgroundColor: colors.warningBg, borderRadius: radius.sm, padding: 10 },
  noticeText: { fontSize: 13, color: colors.warning },
  link: { fontSize: 13, fontWeight: "700", color: colors.orange },
  chips: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.orange },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextSelected: { color: colors.orangeDark },
  count: { fontSize: 14, fontWeight: "800", color: colors.ink },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
});
