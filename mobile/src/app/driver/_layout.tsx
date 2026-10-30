import { Stack } from "expo-router";
import { RoleGate } from "@/components/RoleGate";

/** Espace livreur : réservé aux comptes dont l'écran d'arrivée est `/driver`. */
export default function DriverLayout() {
  return (
    <RoleGate href="/driver">
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGate>
  );
}
