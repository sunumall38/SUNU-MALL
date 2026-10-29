import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { listCategories } from "@/lib/catalog";
import { colors, radius } from "@/theme";
import type { Category } from "@/types";

/** Champ « Catégorie » : ouvre la liste des catégories (principales puis sous-catégories). */
export function CategoryPicker({ value, onChange }: { value: Category | null; onChange: (category: Category) => void }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || categories) return;
    setError(false);
    listCategories()
      .then(setCategories)
      .catch(() => setError(true));
  }, [open, categories]);

  const rows = (categories ?? [])
    .filter((c) => c.parent === null)
    .flatMap((parent) => [parent, ...(categories ?? []).filter((c) => c.parent === parent.id)]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Catégorie</Text>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.field}>
        <Text style={value ? styles.value : styles.placeholder}>{value?.name ?? "Choisir une catégorie"}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Catégorie</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={26} color={colors.ink} />
            </Pressable>
          </View>
          {!categories ? (
            error ? (
              <Text style={styles.muted}>Impossible de charger les catégories. Fermez et réessayez.</Text>
            ) : (
              <ActivityIndicator color={colors.orange} style={styles.loader} />
            )
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => {
                const child = item.parent !== null;
                const selected = item.id === value?.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={[styles.row, child && styles.child]}
                  >
                    <Text style={[child ? styles.childName : styles.parentName, selected && styles.selected]}>{item.name}</Text>
                    {selected ? <Ionicons name="checkmark" size={20} color={colors.orange} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  value: { fontSize: 16, color: colors.ink },
  placeholder: { fontSize: 16, color: colors.mutedForeground },
  modal: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink },
  loader: { marginTop: 32 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", margin: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  child: { paddingLeft: 36 },
  parentName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  childName: { fontSize: 15, color: colors.ink },
  selected: { color: colors.orange },
});
