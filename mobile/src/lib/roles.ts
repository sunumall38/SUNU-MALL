import type { AuthUser } from "@/types";

/**
 * Écran d'arrivée selon le compte, dans le même ordre que
 * `frontend/src/lib/roles.ts`. Les espaces partenaire et admin restent sur
 * le site pour l'instant.
 */
export function roleHomeHref(user: AuthUser) {
  if (user.must_change_password) return "/change-password" as const;
  if (user.roles.some((role) => role === "admin" || role === "super_admin" || role.startsWith("admin_"))) {
    return "/web-only" as const;
  }
  if (user.roles.includes("merchant")) return "/merchant" as const;
  if (user.roles.includes("driver")) return "/driver" as const;
  if (user.roles.includes("partner")) return "/web-only" as const;
  return "/client" as const;
}
