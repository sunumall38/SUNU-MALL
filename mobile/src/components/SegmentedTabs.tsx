import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "@/theme";

/** Onglets en pastilles de la maquette (« En cours / Livrées / Annulées »…). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.id)}
            style={[styles.tab, selected && styles.tabSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  tabSelected: { backgroundColor: colors.orange },
  label: { fontSize: 14, fontWeight: "600", color: colors.mutedForeground },
  labelSelected: { color: colors.white },
});
