import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { apiErrorMessage, apiFieldErrors } from "@/lib/api";
import { createStore, listStoreCategories, updateStore, type StorePayload } from "@/lib/merchant";
import { colors, radius } from "@/theme";
import type { OwnStore } from "@/types";

type Field = "name" | "category" | "phone" | "description" | "address" | "city";

/** Création de la boutique, ou modification (une boutique refusée repart alors en examen). */
export function StoreForm({
  store,
  defaultPhone = "",
  submitLabel,
  onSaved,
}: {
  store?: OwnStore | null;
  defaultPhone?: string;
  submitLabel: string;
  onSaved: (store: OwnStore) => void;
}) {
  const [categories, setCategories] = useState<{ id: number; name: string }[] | null>(null);
  const [values, setValues] = useState({
    name: store?.name ?? "",
    phone: store?.phone ?? defaultPhone,
    description: store?.description ?? "",
    address: store?.address ?? "",
    city: store?.city ?? "",
  });
  const [category, setCategory] = useState<number | null>(store?.category_detail?.id ?? null);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listStoreCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const set = (field: keyof typeof values) => (text: string) => setValues((v) => ({ ...v, [field]: text }));

  async function submit() {
    const nextErrors: Partial<Record<Field, string>> = {
      name: values.name.trim().length >= 2 ? undefined : "Nom de boutique requis",
      phone: values.phone.trim().length >= 6 ? undefined : "Téléphone requis",
      category: category ? undefined : "Choisissez une catégorie",
    };
    setErrors(nextErrors);
    setServerError(null);
    if (Object.values(nextErrors).some(Boolean) || !category) return;

    const payload: StorePayload = {
      name: values.name.trim(),
      category,
      phone: values.phone.trim(),
      description: values.description.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
    };
    setSubmitting(true);
    try {
      onSaved(store ? await updateStore(store.id, payload) : await createStore(payload));
    } catch (err) {
      const fields = apiFieldErrors(err);
      const known = (["name", "category", "phone", "description", "address", "city"] as const).filter((f) => fields[f]);
      if (known.length) setErrors(Object.fromEntries(known.map((f) => [f, fields[f]])));
      else setServerError(apiErrorMessage(err, "Enregistrement impossible. Réessayez."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
      <TextField label="Nom de la boutique" value={values.name} onChangeText={set("name")} error={errors.name} />

      <View style={styles.group}>
        <Text style={styles.label}>Catégorie</Text>
        {categories === null ? (
          <Text style={styles.hint}>Chargement des catégories…</Text>
        ) : (
          <View style={styles.chips}>
            {categories.map((c) => {
              const selected = c.id === category;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(c.id)}
                  style={[styles.chip, selected && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {errors.category ? <Text style={styles.error}>{errors.category}</Text> : null}
      </View>

      <TextField
        label="Téléphone de la boutique"
        keyboardType="phone-pad"
        placeholder="77 000 00 00"
        value={values.phone}
        onChangeText={set("phone")}
        error={errors.phone}
      />
      <TextField
        label="Description"
        placeholder="Ce que vous vendez, ce qui vous distingue"
        value={values.description}
        onChangeText={set("description")}
        error={errors.description}
        multiline
        numberOfLines={3}
        style={styles.multiline}
      />
      <TextField label="Adresse" placeholder="Quartier, rue, repère" value={values.address} onChangeText={set("address")} error={errors.address} />
      <TextField label="Ville" placeholder="Dakar" value={values.city} onChangeText={set("city")} error={errors.city} />

      {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      <Button label={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 13, color: colors.mutedForeground },
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
  multiline: { minHeight: 80, textAlignVertical: "top" },
  error: { fontSize: 13, color: colors.danger },
});
