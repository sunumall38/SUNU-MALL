import Ionicons from "@expo/vector-icons/Ionicons";
import { colors } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône d'onglet : pleine quand l'onglet est actif. La couleur fournie peut être nulle. */
export function tabIcon(active: IconName, inactive: IconName) {
  return ({ color, size, focused }: { color: unknown; size: number; focused: boolean }) => (
    <Ionicons
      name={focused ? active : inactive}
      size={size}
      color={typeof color === "string" ? color : colors.mutedForeground}
    />
  );
}
