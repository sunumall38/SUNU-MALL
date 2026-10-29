import * as Location from "expo-location";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage } from "@/lib/api";
import { createAddress } from "@/lib/orders";
import { colors, radius } from "@/theme";
import type { Address } from "@/types";

/** Nouvelle adresse de livraison, avec la position GPS en option (frais à la distance réelle). */
export function AddressForm({ onCreated, onCancel }: { onCreated: (address: Address) => void; onCancel?: () => void }) {
  const [label, setLabel] = useState("Maison");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Sénégal");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ label?: string; street?: string; city?: string; country?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function locate() {
    setLocating(true);
    setLocationError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setLocationError("Localisation refusée. Vous pouvez l'autoriser dans les réglages du téléphone.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
      });
    } catch {
      setLocationError("Position introuvable. Vérifiez que la localisation est activée.");
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    const nextErrors = {
      label: label.trim() ? undefined : "Libellé requis",
      street: street.trim() ? undefined : "Adresse requise",
      city: city.trim() ? undefined : "Ville requise",
      country: country.trim() ? undefined : "Pays requis",
    };
    setErrors(nextErrors);
    setServerError(null);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    try {
      onCreated(
        await createAddress({
          label: label.trim(),
          street: street.trim(),
          city: city.trim(),
          country: country.trim(),
          ...(coords ?? {}),
        }),
      );
    } catch (err) {
      setServerError(apiErrorMessage(err, "Impossible d'enregistrer l'adresse."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField label="Libellé" placeholder="Maison, Bureau…" value={label} onChangeText={setLabel} error={errors.label} />
      <TextField
        label="Adresse"
        placeholder="Quartier, rue, repère"
        value={street}
        onChangeText={setStreet}
        error={errors.street}
      />
      <TextField label="Ville" placeholder="Dakar" value={city} onChangeText={setCity} error={errors.city} />
      <TextField label="Pays" value={country} onChangeText={setCountry} error={errors.country} />

      <View style={styles.locate}>
        <Button
          label={coords ? "Position enregistrée ✓" : "Utiliser ma position actuelle"}
          variant="secondary"
          onPress={locate}
          loading={locating}
        />
        <Text style={[styles.hint, locationError ? styles.hintError : null]}>
          {locationError ??
            (coords
              ? "Le livreur pourra vous trouver plus facilement."
              : "Recommandé : frais de livraison calculés à la distance réelle et livreur guidé jusqu'à vous.")}
        </Text>
      </View>

      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}

      <Button label="Enregistrer l'adresse" onPress={submit} loading={submitting} />
      {onCancel ? <Button label="Annuler" variant="ghost" onPress={onCancel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  locate: { gap: 6 },
  hint: { fontSize: 12, color: colors.mutedForeground },
  hintError: { color: colors.danger },
  error: { fontSize: 14, color: colors.danger },
});
