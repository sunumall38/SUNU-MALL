import { LayoutDashboard, MapPin, User } from "lucide-react";
import { MustChangePasswordGuard } from "@/components/auth/MustChangePasswordGuard";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/DashboardShell";

const nav: DashboardNavItem[] = [
  { to: "/driver-dashboard", label: "Mes courses", icon: <LayoutDashboard className="h-4 w-4" /> },
  { to: "/driver-delivery", label: "Livraison en cours", icon: <MapPin className="h-4 w-4" /> },
  { to: "/driver-profile", label: "Mon profil", icon: <User className="h-4 w-4" /> },
];

export function DriverLayout() {
  return (
    <RoleGuard roles={["driver"]}>
      <MustChangePasswordGuard to="/driver-password-change">
        <DashboardShell nav={nav} title="Espace livreur" />
      </MustChangePasswordGuard>
    </RoleGuard>
  );
}
