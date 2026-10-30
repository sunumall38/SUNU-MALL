import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { FavoriteButton } from "@/components/FavoriteButton";
import { displayPrice, productImage } from "@/lib/catalog";
import { formatPrice, mediaUrl } from "@/lib/format";
import { colors, radius, shadow } from "@/theme";
import type { Product } from "@/types";

/** Photo produit ; icône à la place si elle manque ou ne se charge pas (fichier absent du stockage). */
function Thumb({ uri, iconSize }: { uri: string | null; iconSize: number }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <Ionicons name="image-outline" size={iconSize} color={colors.mutedForeground} />;
  return <Image source={{ uri }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />;
}

export function openProduct(id: string) {
  router.push({ pathname: "/client/product/[id]", params: { id } });
}

/** Carte produit en grille (accueil, favoris) : photo, cœur, nom, prix. */
export function ProductCard({ product, width, showStore = true }: { product: Product; width: number; showStore?: boolean }) {
  return (
    <ProductTile
      width={width}
      productId={product.id}
      name={product.name}
      price={displayPrice(product)}
      image={productImage(product)}
      subtitle={showStore ? product.store_name : undefined}
    />
  );
}

export function ProductTile({
  width,
  productId,
  name,
  price,
  image,
  subtitle,
}: {
  width: number;
  productId: string;
  name: string;
  price: string | number;
  image: string | null | undefined;
  subtitle?: string;
}) {
  const uri = mediaUrl(image);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => openProduct(productId)}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.imageBox, { height: width }]}>
        <Thumb uri={uri} iconSize={32} />
        <View style={styles.heart}>
          <FavoriteButton productId={productId} />
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.price}>{formatPrice(price)}</Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Ligne produit en liste (recherche) : photo à gauche, infos, cœur. */
export function ProductRow({ product }: { product: Product }) {
  const uri = mediaUrl(productImage(product));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={() => openProduct(product.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowImageBox}>
        <Thumb uri={uri} iconSize={26} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.rowPrice}>{formatPrice(displayPrice(product))}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {product.store_name}
        </Text>
      </View>
      <FavoriteButton productId={product.id} floating={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: radius.md, overflow: "hidden", ...shadow },
  pressed: { opacity: 0.85 },
  imageBox: { alignItems: "center", justifyContent: "center", backgroundColor: colors.muted },
  image: { width: "100%", height: "100%" },
  heart: { position: "absolute", top: 8, right: 8 },
  body: { padding: 10, gap: 3 },
  name: { fontSize: 14, fontWeight: "600", color: colors.ink },
  price: { fontSize: 14, fontWeight: "800", color: colors.ink },
  subtitle: { fontSize: 12, color: colors.mutedForeground },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    padding: 10,
    ...shadow,
  },
  rowImageBox: {
    width: 78,
    height: 78,
    borderRadius: radius.sm,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.muted,
  },
  rowBody: { flex: 1, gap: 3 },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowPrice: { fontSize: 15, fontWeight: "800", color: colors.ink },
});
