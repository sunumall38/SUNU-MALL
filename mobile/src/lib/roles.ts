import type { AuthUser } from "@/types";

/**
 * Écran d'arrivée selon le compte. Les espaces commerçant, partenaire et
 * admin restent sur le site pour l'instant.
 */
export function roleHomeHref(user: AuthUser) {
  if (user.must_change_password) return "/change-password" as const;
  if (user.roles.includes("driver")) return "/driver" as const;
  if (user.roles.includes("client")) return "/client" as const;
  return "/web-only" as const;
}
