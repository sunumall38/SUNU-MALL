import { Redirect } from "expo-router";
import { LoadingScreen } from "@/components/RoleGate";
import { roleHomeHref } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

/** Point d'entrée : écran d'accueil (visiteur), ou l'espace du compte déjà connecté. */
export default function Index() {
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  if (!hasHydrated) return <LoadingScreen />;
  return <Redirect href={user ? roleHomeHref(user) : "/welcome"} />;
}
