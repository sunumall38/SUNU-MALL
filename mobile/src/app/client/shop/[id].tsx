import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ProductCard } from "@/components/ProductCard";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { apiErrorMessage } from "@/lib/api";
import { getStore, listProducts } from "@/lib/catalog";
import { mediaUrl } from "@/lib/format";
import { formatDate } from "@/lib/orderStatus";
import { usePaginated } from "@/lib/usePaginated";
import { colors, radius, shadow } from "@/theme";
import type { Store } from "@/types";

type Tab = "products" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "products", label: "Produits" },
  { id: "about", label: "À propos" },
];

const GAP = 12;
const BANNER_HEIGHT = 150;

/** Vitrine d'une boutique : bannière, identité, chiffres clés, produits, à propos. */
export default function ShopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - GAP) / 2;
  const [store, setStore] = useState<Store | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("products");
  const products = usePaginated(`store:${id}`, (page) => listProducts({ page, store: id }));

  const loadStore = useCallback(async () => {
    setStoreError(null);
    try {
      setStore(await getStore(id));
    } catch (err) {
      setStoreError(apiErrorMessage(err, "Impossible de charger cette boutique."));
    }
  }, [id]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  function refresh() {
    void loadStore();
    void products.refresh();
  }

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retour"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/client"))}
      style={[styles.back, { top: insets.top + 8 }]}
    >
      <Ionicons name="arrow-back" size={22} color={colors.ink} />
    </Pressable>
  );

  if (!store) {
    return (
      <View style={styles.center}>
        {back}
        {storeError ? (
          <>
            <Text style={styles.muted}>{storeError}</Text>
            <Button label="Réessayer" variant="secondary" onPress={loadStore} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={tab === "products" ? products.items : []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ProductCard product={item} width={cardWidth} showStore={false} />}
        onEndReached={tab === "products" ? products.loadMore : undefined}
        onEndReachedThreshold={0.5}
        refreshControl={<RefreshControl refreshing={products.refreshing} onRefresh={refresh} tintColor={colors.orange} />}
        ListHeaderComponent={
          <ShopHeader store={store} productCount={products.count} topInset={insets.top} tab={tab} onTab={setTab} />
        }
        ListEmptyComponent={
          tab === "about" ? (
            <About store={store} />
          ) : products.loading ? (
            <ActivityIndicator color={colors.orange} style={styles.loader} />
          ) : products.error ? (
            <View style={styles.state}>
              <Text style={styles.muted}>{products.error}</Text>
              <Button label="Réessayer" variant="secondary" onPress={products.retry} />
            </View>
          ) : (
            <Text style={styles.muted}>Cette boutique n'a pas encore de produit en vente.</Text>
          )
        }
        ListFooterComponent={products.loadingMore && tab === "products" ? <ActivityIndicator color={colors.orange} /> : undefined}
      />
      {back}
    </View>
  );
}

function ShopHeader({
  store,
  productCount,
  topInset,
  tab,
  onTab,
}: {
  store: Store;
  productCount: number | null;
  topInset: number;
  tab: Tab;
  onTab: (tab: Tab) => void;
}) {
  const logo = mediaUrl(store.logo_url);
  const banner = mediaUrl(store.banner_url);
  const category = store.category_detail?.name ?? store.category_names[0];

  return (
    <View style={styles.header}>
      <View style={[styles.banner, { height: BANNER_HEIGHT + topInset }]}>
        {banner ? (
          <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={styles.bannerPattern}>
            <Ionicons name="storefront-outline" size={64} color="rgba(255,255,255,0.12)" />
          </View>
        )}
      </View>

      <View style={styles.sheet}>
        <View style={styles.logo}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logoImage} />
          ) : (
            <Text style={styles.initial}>{store.name.trim().charAt(0).toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.nameRow}>
          <Text style={styles.name}>{store.name}</Text>
          {store.is_verified_seller ? (
            <Ionicons name="checkmark-circle" size={20} color={colors.success} accessibilityLabel="Vendeur vérifié" />
          ) : null}
        </View>
        <Text style={styles.subtitle}>{[category, store.city].filter(Boolean).join(" · ")}</Text>

        <View style={styles.stats}>
          <Stat value={productCount != null ? String(productCount) : "…"} label="Produits" />
          <View style={styles.statDivider} />
          <Stat
            value={store.rating != null ? `★ ${store.rating.toFixed(1)}` : "—"}
            label={store.rating != null ? "Note" : "Pas encore notée"}
          />
          <View style={styles.statDivider} />
          <Stat value={String(store.review_count)} label="Avis" />
        </View>

        <View style={styles.tabs}>
          <SegmentedTabs options={TABS} value={tab} onChange={onTab} />
        </View>
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function About({ store }: { store: Store }) {
  return (
    <View style={styles.about}>
      <AboutRow icon="information-circle-outline" title="Présentation">
        {store.description || "Cette boutique n'a pas encore de présentation."}
      </AboutRow>
      <AboutRow icon="location-outline" title="Adresse">
        {[store.address, store.city].filter(Boolean).join(", ") || "Non renseignée"}
      </AboutRow>
      {store.is_verified_seller ? (
        <AboutRow icon="shield-checkmark-outline" title="Vendeur vérifié">
          Identité du vendeur vérifiée par Sunu Mall.
        </AboutRow>
      ) : null}
      {store.created_at ? (
        <AboutRow icon="calendar-outline" title="Sur Sunu Mall">
          {`Depuis le ${formatDate(store.created_at)}`}
        </AboutRow>
      ) : null}
    </View>
  );
}

function AboutRow({ icon, title, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; children: string }) {
  return (
    <View style={styles.aboutRow}>
      <View style={styles.aboutIcon}>
        <Ionicons name={icon} size={20} color={colors.orange} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.aboutTitle}>{title}</Text>
        <Text style={styles.aboutText}>{children}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginVertical: 24 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: GAP, marginBottom: GAP },
  loader: { marginVertical: 24 },
  state: { gap: 12, alignItems: "center", paddingVertical: 24 },
  back: {
    position: "absolute",
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadow,
  },
  header: { marginHorizontal: -16, marginBottom: 4 },
  banner: { backgroundColor: colors.navy, overflow: "hidden" },
  bannerPattern: { flex: 1, alignItems: "flex-end", justifyContent: "flex-end", padding: 16 },
  sheet: {
    marginTop: -24,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 6,
    alignItems: "center",
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginTop: -42,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
    borderWidth: 4,
    borderColor: colors.background,
  },
  logoImage: { width: "100%", height: "100%" },
  initial: { fontSize: 32, fontWeight: "800", color: colors.white },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  name: { fontSize: 22, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.mutedForeground },
  stats: {
    flexDirection: "row",
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingVertical: 12,
    marginVertical: 8,
    ...shadow,
  },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { fontSize: 17, fontWeight: "800", color: colors.ink },
  statLabel: { fontSize: 12, color: colors.mutedForeground },
  statDivider: { width: 1, height: 30, backgroundColor: colors.border },
  tabs: { alignSelf: "stretch" },
  about: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 16, ...shadow },
  aboutRow: { flexDirection: "row", gap: 12 },
  aboutIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  aboutTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  aboutText: { fontSize: 14, lineHeight: 20, color: colors.mutedForeground, marginTop: 2 },
});
