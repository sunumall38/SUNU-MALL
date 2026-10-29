import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { CategoryPicker } from "@/components/CategoryPicker";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { createProduct, createVariant, uploadProductImage } from "@/lib/merchant";
import { pickPhotos, type PickedPhoto } from "@/lib/photos";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius } from "@/theme";
import type { Category } from "@/types";

const MAX_PHOTOS = 5;

/** Nombre entier saisi (« 15 000 » → 15000), ou null. */
function parseAmount(text: string) {
  const digits = text.replace(/[\s .]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

export default function NewProductScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const store = useMerchantStore((s) => s.store);
  const kycVerified = useMerchantStore((s) => s.kyc?.status === "VERIFIED");
  const reloadMerchant = useMerchantStore((s) => s.load);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("1");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  async function addPhotos() {
    const picked = await pickPhotos(MAX_PHOTOS - photos.length);
    setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS));
  }

  async function publish() {
    const amount = parseAmount(price);
    const quantity = parseAmount(stock);
    const nextErrors = {
      name: name.trim() ? undefined : "Nom requis",
      price: amount && amount > 0 ? undefined : "Prix en FCFA, chiffres uniquement",
      stock: quantity !== null ? undefined : "Quantité en stock (0 ou plus)",
    };
    setErrors(nextErrors);
    setServerError(null);
    if (!store || nextErrors.name || nextErrors.price || nextErrors.stock) return;

    // Identité pas encore vérifiée : le produit attend en brouillon (le serveur refuserait de le publier).
    setStep("Création du produit…");
    let productId: string;
    try {
      const product = await createProduct({
        store: store.id,
        category: category?.id ?? null,
        name: name.trim(),
        description: description.trim(),
        base_price: String(amount),
        status: kycVerified ? "active" : "draft",
      });
      productId = product.id;
    } catch (err) {
      setServerError(apiErrorMessage(err, "Impossible de créer le produit."));
      setStep(null);
      return;
    }

    // Produit créé : la suite (prix, stock, photos) se rattrape depuis sa fiche en cas d'échec.
    const problems: string[] = [];
    try {
      setStep("Prix et stock…");
      await createVariant({ product: productId, price: String(amount), initial_quantity: quantity ?? 0 });
    } catch {
      problems.push("le prix et le stock");
    }
    for (const [index, photo] of photos.entries()) {
      setStep(`Envoi des photos (${index + 1}/${photos.length})…`);
      try {
        await uploadProductImage(productId, photo);
      } catch {
        problems.push(`la photo ${index + 1}`);
      }
    }
    setStep(null);
    if (userId) void reloadMerchant(userId);

    router.replace({
      pathname: "/merchant/product/[id]",
      params: problems.length ? { id: productId, warning: `Produit créé, mais ${problems.join(", ")} n'ont pas pu être enregistrés.` } : { id: productId },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.photos}>
          {photos.map((photo, index) => (
            <View key={`${index}-${photo.uri}`} style={styles.photo}>
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retirer la photo ${index + 1}`}
                onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
                style={styles.remove}
                hitSlop={6}
              >
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <Pressable accessibilityRole="button" onPress={addPhotos} style={[styles.photo, styles.addPhoto]}>
              <Ionicons name="camera-outline" size={26} color={colors.mutedForeground} />
              <Text style={styles.addPhotoText}>Ajouter des photos</Text>
            </Pressable>
          ) : null}
        </View>

        <TextField label="Nom du produit" value={name} onChangeText={setName} error={errors.name} />
        <CategoryPicker value={category} onChange={setCategory} />
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField label="Prix (FCFA)" keyboardType="number-pad" value={price} onChangeText={setPrice} error={errors.price} />
          </View>
          <View style={styles.flex}>
            <TextField label="Stock" keyboardType="number-pad" value={stock} onChangeText={setStock} error={errors.stock} />
          </View>
        </View>
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          style={styles.description}
        />
        {!kycVerified ? (
          <Text style={styles.note}>
            Votre identité est en cours de vérification : le produit sera enregistré en brouillon, à publier une fois
            votre compte validé.
          </Text>
        ) : null}
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      </ScrollView>
      <View style={styles.bottomBar}>
        {step ? <Text style={styles.step}>{step}</Text> : null}
        <Button
          label={kycVerified ? "Publier le produit" : "Enregistrer en brouillon"}
          onPress={publish}
          loading={step !== null}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 14 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: 100, height: 100, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.muted },
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
  addPhotoText: { fontSize: 11, color: colors.mutedForeground, textAlign: "center" },
  row: { flexDirection: "row", gap: 12 },
  description: { minHeight: 96, textAlignVertical: "top" },
  note: { fontSize: 13, lineHeight: 18, color: colors.warning },
  error: { fontSize: 14, color: colors.danger },
  bottomBar: { padding: 16, gap: 8, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  step: { fontSize: 13, color: colors.mutedForeground, textAlign: "center" },
});
