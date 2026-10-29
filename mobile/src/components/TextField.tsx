import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/theme";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  /** Texte fixe devant la saisie (ex. « +221 »). */
  prefix?: string;
}

export function TextField({ label, error, hint, prefix, style, ...props }: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, error ? styles.boxError : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, style]}
          {...props}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { fontSize: 14, fontWeight: "500", color: colors.ink },
  box: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
  },
  boxError: { borderColor: colors.danger },
  prefix: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  input: { flex: 1, fontSize: 16, color: colors.ink, paddingVertical: 12 },
  error: { fontSize: 13, color: colors.danger },
  hint: { fontSize: 13, color: colors.mutedForeground },
});
