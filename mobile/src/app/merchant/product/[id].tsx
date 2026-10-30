import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice, mediaUrl } from "@/lib/format";
import {
  createVariant,
  deleteProductImage,
  getMyProduct,
  PRODUCT_STATUS,
  updateProduct,
  updateVariantPrice,
  uploadProductImage,
} from "@/lib/merchant";
import { pickPhotos } from "@/lib/photos";
import { colors, radius, shadow } from "@/theme";
import type { Product } from "@/types";

const MAX_PHOTOS = 5;

function parseAmount(text: string) {
  const digits = text.replace(/[\s .]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Fiche d'un produit de la boutique : photos, infos, prix, publication. */
export default function MerchantProductScreen() {
  const { id, warning } = useLocalSearchParams<{ id: string; warning?: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setProduct(await getMyProduct(id));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger ce produit."));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!product) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={load} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} />
        )}
      </View>
    );
  }
  return <ProductEditor product={product} onChange={setProduct} reload={load} warning={warning} />;
}

function ProductEditor({
  product,
  onChange,
  reload,
  warning,
}: {
  product: Product;
  onChange: (product: Product) => void;
  reload: () => Promise<void>;
  warning?: string;
}) {
  const variant = product.variants[0];
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(Math.round(Number(variant?.price ?? product.base_price))));
  const [stock, setStock] = useState("1");
  const [description, setDescription] = useState(product.description);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    warning ? { text: warning, error: true } : null,
  );
  const status = PRODUCT_STATUS[product.status];

  async function run(label: string, task: () => Promise<void>, success: string) {
    setBusy(label);
    setMessage(null);
    try {
      await task();
      setMessage({ text: success, error: false });
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, "L'opération a échoué."), error: true });
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const amount = parseAmount(price);
    if (!name.trim() || !amount) {
      setMessage({ text: "Nom et prix (en FCFA) sont requis.", error: true });
      return;
    }
    void run(
      "save",
      async () => {
        const updated = await updateProduct(product.id, {
          name: name.trim(),
          description: description.trim(),
          base_price: String(amount),
        });
        if (variant && Number(variant.price) !== amount) await updateVariantPrice(variant.id, String(amount));
        onChange(variant ? await getMyProductSafe(product.id, updated) : updated);
      },
      "Modifications enregistrées.",
    );
  }

  function addSaleVariant() {
    const amount = parseAmount(price);
    const quantity = parseAmount(stock);
    if (!amount || quantity === null) {
      setMessage({ text: "Prix et stock (chiffres uniquement) sont requis.", error: true });
      return;
    }
    void run(
      "variant",
      async () => {
        await createVariant({ product: product.id, price: String(amount), initial_quantity: quantity });
        await reload();
      },
      "Prix et stock enregistrés.",
    );
  }

  function setStatus(next: "active" | "inactive") {
    void run(
      "status",
      async () => onChange(await updateProduct(product.id, { status: next })),
      next === "active" ? "Produit publié : il est visible des clients." : "Produit désactivé : il n'est plus en vente.",
    );
  }

  async function addPhotos() {
    const photos = await pickPhotos(MAX_PHOTOS - product.images.length);
    if (photos.length === 0) return;
    void run(
      "photos",
      async () => {
        for (const photo of photos) await uploadProductImage(product.id, photo);
        await reload();
      },
      "Photos ajoutées.",
    );
  }

  function removePhoto(imageId: string) {
    Alert.alert("Retirer cette photo ?", undefined, [
      { text: "Non", style: "cancel" },
      {
        text: "Retirer",
        style: "destructive",
        onPress: () =>
          void run(
            "photos",
            async () => {
              await deleteProductImage(product.id, imageId);
              await reload();
            },
            "Photo retirée.",
          ),
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ title: product.name }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.statusRow}>
          <Badge label={status.label} color={status.color} background={status.background} />
          {variant ? (
            <Text style={styles.muted}>
              Stock : {variant.quantity} · {variant.is_available ? "en vente" : "épuisé"}
            </Text>
          ) : null}
        </View>

        {message ? (
          <Text style={[styles.message, message.error ? styles.messageError : styles.messageOk]}>{message.text}</Text>
        ) : null}

        <View style={styles.photos}>
          {product.images.map((image) => {
            const uri = mediaUrl(image.url);
            return (
              <View key={image.id} style={styles.photo}>
                {uri ? <Image source={{ uri }} style={styles.photoImage} /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retirer la photo"
                  onPress={() => removePhoto(image.id)}
                  style={styles.remove}
                  hitSlop={6}
                >
                  <Ionicons name="close" size={14} color={colors.white} />
                </Pressable>
              </View>
            );
          })}
          {product.images.length < MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" onPress={addPhotos} style={[styles.photo, styles.addPhoto]} disabled={busy !== null}>
              {busy === "photos" ? (
                <ActivityIndicator color={colors.orange} />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={26} color={colors.mutedForeground} />
                  <Text style={styles.addPhotoText}>Ajouter</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>

        {!variant ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Prix et stock manquants</Text>
            <Text style={styles.muted}>Sans prix de vente, les clients ne peuvent pas commander ce produit.</Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label="Prix (FCFA)" keyboardType="number-pad" value={price} onChangeText={setPrice} />
              </View>
              <View style={styles.flex}>
                <TextField label="Stock" keyboardType="number-pad" value={stock} onChangeText={setStock} />
              </View>
            </View>
            <Button label="Enregistrer le prix et le stock" onPress={addSaleVariant} loading={busy === "variant"} />
          </View>
        ) : null}

        <View style={styles.card}>
          <TextField label="Nom du produit" value={name} onChangeText={setName} />
          {variant ? (
            <TextField
              label="Prix (FCFA)"
              keyboardType="number-pad"
              value={price}
              onChangeText={setPrice}
              hint={`Prix actuel : ${formatPrice(variant.price)}`}
            />
          ) : null}
          <TextField
            label="Description"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.description}
          />
          <Button label="Enregistrer les modifications" variant="secondary" onPress={save} loading={busy === "save"} />
        </View>

        {product.status === "active" ? (
          <Button label="Désactiver (retirer de la vente)" variant="ghost" onPress={() => setStatus("inactive")} loading={busy === "status"} />
        ) : (
          <Button label="Publier le produit" onPress={() => setStatus("active")} loading={busy === "status"} disabled={!variant} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Relit le produit après un changement de prix de variante ; à défaut, garde la réponse déjà reçue. */
async function getMyProductSafe(id: string, fallback: Product) {
  try {
    return await getMyProduct(id);
  } catch {
    return fallback;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  muted: { fontSize: 13, color: colors.mutedForeground },
  message: { fontSize: 14, lineHeight: 20, borderRadius: radius.sm, padding: 10, overflow: "hidden" },
  messageError: { color: colors.danger, backgroundColor: "#FEF2F2" },
  messageOk: { color: colors.success, backgroundColor: colors.successBg },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: 96, height: 96, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.muted },
  photoImage: { width: "100%", height: "100%" },
  remove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,24,39,0.7)",
  },
  addPhoto: { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  addPhotoText: { fontSize: 12, color: colors.mutedForeground },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 12, ...shadow },
  cardTitle: { fontSize: 15, fontWeight: "800", color: colors.danger },
  row: { flexDirection: "row", gap: 12 },
  description: { minHeight: 96, textAlignVertical: "top" },
});
