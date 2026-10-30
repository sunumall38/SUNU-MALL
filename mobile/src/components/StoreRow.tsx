import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { mediaUrl } from "@/lib/format";
import { colors, radius, shadow } from "@/theme";
import type { Store } from "@/types";

/** « 850 m », « 2,3 km ». */
function formatDistance(km: number) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Carte boutique : logo, nom vérifié, catégorie, note, ville (et distance si connue). */
export function StoreRow({ store, distanceKm }: { store: Store; distanceKm?: number | null }) {
  const logo = mediaUrl(store.logo_url);
  const category = store.category_detail?.name ?? store.category_names[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={store.name}
      onPress={() => router.push({ pathname: "/client/shop/[id]", params: { id: store.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.logo}>
        {logo ? (
          <Image source={{ uri: logo }} style={styles.logoImage} />
        ) : (
          <Text style={styles.initial}>{store.name.trim().charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {store.name}
          </Text>
          {store.is_verified_seller ? (
            <Ionicons name="checkmark-circle" size={15} color={colors.success} accessibilityLabel="Vendeur vérifié" />
          ) : null}
        </View>
        {category ? (
          <Text style={styles.category} numberOfLines={1}>
            {category}
          </Text>
        ) : null}
        <View style={styles.metaRow}>
          {store.rating != null ? (
            <Text style={styles.meta}>
              <Text style={styles.star}>★</Text> {store.rating.toFixed(1)} ({store.review_count} avis)
            </Text>
          ) : (
            <Text style={styles.meta}>Nouvelle boutique</Text>
          )}
          {store.city ? (
            <View style={styles.city}>
              <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
              <Text style={styles.meta} numberOfLines={1}>
                {store.city}
                {distanceKm != null ? ` · à ${formatDistance(distanceKm)}` : ""}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 12,
    ...shadow,
  },
  pressed: { opacity: 0.8 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
  logoImage: { width: "100%", height: "100%" },
  initial: { fontSize: 22, fontWeight: "800", color: colors.white },
  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: "800", color: colors.ink },
  category: { fontSize: 13, fontWeight: "600", color: colors.orangeDark },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 2 },
  meta: { fontSize: 12, color: colors.mutedForeground },
  star: { color: colors.orange },
  city: { flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
});
