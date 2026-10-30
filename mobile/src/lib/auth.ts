import { apiPost } from "@/lib/api";
import { normalizeSenegalPhone } from "@/lib/phone";
import type { AuthResponse } from "@/types";

/** Identifiant de connexion : le numéro (+221…) ou, pour les comptes sans numéro, l'email. */
export type LoginIdentifier = { phone: string } | { email: string };

export const IDENTIFIER_ERROR = "Entrez votre numéro (ex. 77 123 45 67) ou votre adresse email.";

/** Un seul champ « numéro ou email » : un « @ » désigne un email, sinon un numéro sénégalais. */
export function parseIdentifier(input: string): LoginIdentifier | null {
  const value = input.trim();
  if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value.toLowerCase() } : null;
  const phone = normalizeSenegalPhone(value);
  return phone ? { phone } : null;
}

export function login(identifier: LoginIdentifier, password: string) {
  return apiPost<AuthResponse>("/auth/login/", { ...identifier, password }, { auth: false });
}

export function resendVerification(identifier: LoginIdentifier) {
  return apiPost<{ message: string }>("/auth/resend-verification/", identifier, { auth: false });
}

export function changePassword(payload: { current_password: string; new_password: string; confirm_password: string }) {
  return apiPost<{ message: string }>("/auth/change-password/", payload);
}

export interface RegisterPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  role_name: "client" | "merchant";
}

/** Inscription : le compte s'active ensuite par le lien envoyé par email. */
export function register(payload: RegisterPayload) {
  return apiPost<AuthResponse>("/auth/register/", { ...payload, verification_channel: "email" }, { auth: false });
}

/** Envoie un lien de réinitialisation à l'email du compte (réponse identique si le compte n'existe pas). */
export function requestPasswordReset(identifier: LoginIdentifier) {
  return apiPost<{ message: string }>("/auth/password-reset/", identifier, { auth: false });
}
