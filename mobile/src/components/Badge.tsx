import { StyleSheet, Text } from "react-native";
import { radius } from "@/theme";

/** Pastille de statut (« À préparer », « Livrée »…). */
export function Badge({ label, color, background }: { label: string; color: string; background: string }) {
  return <Text style={[styles.badge, { color, backgroundColor: background }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
