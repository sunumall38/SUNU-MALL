import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from "react-native";
import { colors } from "@/theme";

type Variant = "primary" | "secondary" | "ghost";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({ label, variant = "primary", loading = false, disabled, style, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.orange} />
      ) : (
        <Text
          style={[styles.label, variant === "primary" ? styles.labelPrimary : styles.labelOther]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.orange },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.orange },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  label: { fontSize: 16, fontWeight: "600" },
  labelPrimary: { color: colors.white },
  labelOther: { color: colors.orange },
});
