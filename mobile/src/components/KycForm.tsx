import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { KYC_DOCUMENT_TYPES, submitKyc, type KycDocumentType } from "@/lib/merchant";
import { pickPhotos, type PickedPhoto } from "@/lib/photos";
import { colors, radius } from "@/theme";

/** Envoi de la pièce d'identité du vendeur (recto / verso), depuis l'appareil photo ou la galerie. */
export function KycForm({ onDone }: { onDone: () => void }) {
  const [documentType, setDocumentType] = useState<KycDocumentType>("cni");
  const [front, setFront] = useState<PickedPhoto | null>(null);
  const [back, setBack] = useState<PickedPhoto | null>(null);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pick(side: "front" | "back") {
    const [photo] = await pickPhotos(1);
    if (!photo) return;
    if (side === "front") setFront(photo);
    else setBack(photo);
  }

  async function submit() {
    if (!front || !back) {
      setError("Ajoutez la photo du recto et du verso de votre pièce.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await submitKyc({ documentType, front, back, address: address.trim() });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Envoi impossible. Vérifiez votre connexion et réessayez."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Type de pièce</Text>
      <View style={styles.chips}>
        {KYC_DOCUMENT_TYPES.map((type) => {
          const selected = type.id === documentType;
          return (
            <Pressable
              key={type.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setDocumentType(type.id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{type.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sides}>
        <PhotoSlot label="Recto" photo={front} onPress={() => pick("front")} />
        <PhotoSlot label="Verso" photo={back} onPress={() => pick("back")} />
      </View>
      <Text style={styles.hint}>Photo nette, sans reflet, les quatre coins visibles.</Text>

      <TextField label="Adresse (facultatif)" placeholder="Quartier, ville" value={address} onChangeText={setAddress} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Envoyer mes pièces" onPress={submit} loading={submitting} />
    </View>
  );
}

function PhotoSlot({ label, photo, onPress }: { label: string; photo: PickedPhoto | null; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Photo ${label.toLowerCase()}`} onPress={onPress} style={styles.slot}>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.slotImage} />
      ) : (
        <>
          <Ionicons name="camera-outline" size={28} color={colors.mutedForeground} />
          <Text style={styles.slotText}>{label}</Text>
        </>
      )}
      {photo ? <Text style={styles.slotBadge}>{label} ✓</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  chipSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextSelected: { color: colors.orangeDark },
  sides: { flexDirection: "row", gap: 12 },
  slot: {
    flex: 1,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
  },
  slotImage: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  slotText: { fontSize: 13, fontWeight: "600", color: colors.mutedForeground },
  slotBadge: {
    position: "absolute",
    bottom: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
    backgroundColor: "rgba(17,24,39,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  hint: { fontSize: 12, color: colors.mutedForeground, marginTop: -6 },
  error: { fontSize: 14, color: colors.danger },
});
