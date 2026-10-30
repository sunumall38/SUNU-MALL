import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

/** Logo de la maquette : sac orange + « Sunu » marine + « Mall » orange. */
export function Logo({ size = 28, stacked = false }: { size?: number; stacked?: boolean }) {
  return (
    <View style={[styles.row, stacked && styles.stacked]} accessibilityRole="header" accessibilityLabel="Sunu Mall">
      <Image source={require("../../assets/logo-icon.png")} style={{ width: size, height: size }} resizeMode="contain" />
      <Text style={[styles.text, { fontSize: stacked ? size * 0.45 : size * 0.75 }]}>
        Sunu<Text style={styles.accent}>Mall</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  stacked: { flexDirection: "column", gap: 8 },
  text: { fontWeight: "800", color: colors.navy, letterSpacing: -0.5 },
  accent: { color: colors.orange },
});
