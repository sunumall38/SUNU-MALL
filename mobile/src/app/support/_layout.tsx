import { Stack } from "expo-router";
import { colors } from "@/theme";

/** Support Sunu Mall : commun à tous les comptes (client, vendeur, livreur). */
export default function SupportLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.ink,
        headerBackTitle: "Retour",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Aide et support" }} />
      <Stack.Screen name="[id]" options={{ title: "Ma demande" }} />
    </Stack>
  );
}
