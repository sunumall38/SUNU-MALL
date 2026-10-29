import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/**
 * Compte créé par un tiers (livreur, partenaire) avec un mot de passe
 * provisoire : tant qu'il n'est pas changé, toute page de l'espace renvoie
 * vers `to`, l'écran de changement de mot de passe.
 */
export function MustChangePasswordGuard({ to, children }: { to: string; children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  if (user?.must_change_password && pathname !== to) {
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}
