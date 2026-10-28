import { apiGet, apiPost } from "@/lib/api";
import type { AuthUser } from "@/types";

export interface AuthResponse {
  user: AuthUser;
  access: string | null;
  refresh: string | null;
  message?: string;
  verification_channel?: "sms" | "email";
  phone_verification_token?: string | null;
}

export function login(phone: string, password: string) {
  return apiPost<AuthResponse>("/auth/login/", { phone, password }, { auth: false });
}

export function register(payload: {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone: string;
  role_name?: "client" | "merchant" | "driver";
  verification_channel?: "sms" | "email";
} | FormData) {
  return apiPost<AuthResponse>("/auth/register/", payload, { auth: false });
}

export function verifyRegistrationPhone(token: string, code: string) {
  return apiPost<{ message: string; phone_verified: true }>(
    "/auth/verify-registration-phone/",
    { token, code },
    { auth: false },
  );
}

export function resendVerification(phone: string) {
  return apiPost<{ message: string }>("/auth/resend-verification/", { phone }, { auth: false });
}

/** Réponse quand l'email appartient déjà à un client invité : un lien lui est envoyé. */
export interface GuestLoginLinkSent {
  login_link_sent: true;
  message: string;
}

export function guestCheckout(payload: { email: string; first_name: string; last_name?: string; phone: string }) {
  return apiPost<AuthResponse | GuestLoginLinkSent>("/auth/guest-checkout/", payload, { auth: false });
}

/** Échange le lien reçu par email contre une session invité. */
export function guestLogin(token: string) {
  return apiPost<AuthResponse>("/auth/guest-login/", { token }, { auth: false });
}

export function setPassword(password: string) {
  return apiPost<{ message: string }>("/auth/set-password/", { password });
}

export function changePassword(payload: {
  current_password: string;
  new_password: string;
  confirm_password: string;
}) {
  return apiPost<{ message: string }>("/auth/change-password/", payload);
}

export function verifyEmail(uid: string, token: string) {
  return apiGet<{ message: string }>(
    `/auth/verify-email/?uid=${encodeURIComponent(uid)}&token=${encodeURIComponent(token)}`,
    { auth: false },
  );
}

/** Demande de lien « mot de passe oublié » (réponse identique si le compte n'existe pas). */
export function requestPasswordReset(payload: { phone?: string; email?: string }) {
  return apiPost<{ message: string }>("/auth/password-reset/", payload, { auth: false });
}

export function confirmPasswordReset(payload: { token: string; new_password: string; confirm_password: string }) {
  return apiPost<{ message: string }>("/auth/password-reset/confirm/", payload, { auth: false });
}

/** Options d'inscription de cet environnement (SMS disponible ou non). */
export function getAuthOptions() {
  return apiGet<{ sms_verification: boolean }>("/auth/options/", { auth: false });
}
