import { apiPost } from "@/lib/api";
import type { AuthResponse } from "@/types";

/** Identifiant de connexion : le numéro (+221…) ou, pour les comptes sans numéro, l'email. */
export type LoginIdentifier = { phone: string } | { email: string };

export function login(identifier: LoginIdentifier, password: string) {
  return apiPost<AuthResponse>("/auth/login/", { ...identifier, password }, { auth: false });
}

export function resendVerification(identifier: LoginIdentifier) {
  return apiPost<{ message: string }>("/auth/resend-verification/", identifier, { auth: false });
}

export function changePassword(payload: { current_password: string; new_password: string; confirm_password: string }) {
  return apiPost<{ message: string }>("/auth/change-password/", payload);
}
