import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet } from "react-native";
import { useAuthStore } from "@/store/auth";
import { isFavorite, useWishlistStore } from "@/store/wishlist";
import { colors, shadow } from "@/theme";

/** Cœur des cartes produit : ajoute ou retire des favoris (connexion demandée aux visiteurs). */
export function FavoriteButton({ productId, size = 18, floating = true }: { productId: string; size?: number; floating?: boolean }) {
  const signedIn = useAuthStore((s) => s.user !== null);
  const liked = useWishlistStore((s) => isFavorite(s.wishlist, productId));
  const toggle = useWishlistStore((s) => s.toggle);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
      accessibilityState={{ selected: liked }}
      hitSlop={8}
      onPress={() => (signedIn ? toggle(productId) : router.push("/login"))}
      style={floating ? styles.floating : undefined}
    >
      <Ionicons name={liked ? "heart" : "heart-outline"} size={size} color={colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  floating: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    ...shadow,
  },
});
