import { Stack } from "expo-router";
import { RoleGate } from "@/components/RoleGate";

/** Espace client : réservé aux comptes dont l'écran d'arrivée est `/client`. */
export default function ClientLayout() {
  return (
    <RoleGate href="/client">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGate>
  );
}
