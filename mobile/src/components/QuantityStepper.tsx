import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  size?: "md" | "sm";
}

export function QuantityStepper({ value, onChange, min = 1, max = 99, disabled = false, size = "md" }: QuantityStepperProps) {
  const button = size === "sm" ? styles.buttonSm : styles.button;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Diminuer la quantité"
        disabled={disabled || value <= min}
        onPress={() => onChange(value - 1)}
        style={[button, (disabled || value <= min) && styles.disabled]}
      >
        <Ionicons name="remove" size={18} color={colors.ink} />
      </Pressable>
      <Text style={[styles.value, size === "sm" && styles.valueSm]} accessibilityLabel={`Quantité ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Augmenter la quantité"
        disabled={disabled || value >= max}
        onPress={() => onChange(value + 1)}
        style={[button, (disabled || value >= max) && styles.disabled]}
      >
        <Ionicons name="add" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  buttonSm: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  disabled: { opacity: 0.4 },
  value: { minWidth: 36, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.ink },
  valueSm: { minWidth: 28, fontSize: 15 },
});
