import { apiPost } from "@/lib/api";
import type { AuthResponse } from "@/types";

export function login(phone: string, password: string) {
  return apiPost<AuthResponse>("/auth/login/", { phone, password }, { auth: false });
}

export function resendVerification(phone: string) {
  return apiPost<{ message: string }>("/auth/resend-verification/", { phone }, { auth: false });
}

export function changePassword(payload: { current_password: string; new_password: string; confirm_password: string }) {
  return apiPost<{ message: string }>("/auth/change-password/", payload);
}
