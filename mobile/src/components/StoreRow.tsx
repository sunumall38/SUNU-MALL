import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { mediaUrl } from "@/lib/format";
import { colors } from "@/theme";
import type { Store } from "@/types";

/** Ligne boutique de la maquette : logo rond, nom, catégorie · note (avis) · ville. */
export function StoreRow({ store }: { store: Store }) {
  const logo = mediaUrl(store.logo_url);
  const category = store.category_detail?.name ?? store.category_names[0];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={store.name}
      onPress={() => router.push({ pathname: "/client/shop/[id]", params: { id: store.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
        <Text style={styles.meta} numberOfLines={1}>
          {[
            category,
            store.rating != null ? `★ ${store.rating.toFixed(1)} (${store.review_count})` : null,
            store.city,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  logo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
  logoImage: { width: "100%", height: "100%" },
  initial: { fontSize: 20, fontWeight: "800", color: colors.white },
  body: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  meta: { fontSize: 13, color: colors.mutedForeground },
});
