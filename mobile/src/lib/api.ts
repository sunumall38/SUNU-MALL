/**
 * Client API du backend Django/DRF — même comportement que
 * `frontend/src/lib/api.ts` : jeton JWT injecté, refresh sur 401.
 */
import { API_BASE_URL } from "@/lib/config";
import { useAuthStore } from "@/store/auth";

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown, message?: string) {
    super(message ?? `Erreur API (${status})`);
    this.status = status;
    this.data = data;
  }
}

/** Message lisible d'une erreur DRF (detail, error, non_field_errors, champ en échec…). */
export function apiErrorMessage(err: unknown, fallback = "Une erreur est survenue."): string {
  if (!(err instanceof ApiError)) return "Impossible de contacter le serveur. Vérifiez votre connexion.";
  const read = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const texts = value.filter((v): v is string => typeof v === "string");
      return texts.length ? texts.join(" ") : null;
    }
    return null;
  };
  const direct = read(err.data);
  if (direct) return direct;
  if (err.data && typeof err.data === "object") {
    const record = err.data as Record<string, unknown>;
    for (const key of ["detail", "error", "non_field_errors"]) {
      const text = read(record[key]);
      if (text) return text;
    }
    for (const value of Object.values(record)) {
      const text = read(value);
      if (text) return text;
    }
  }
  return fallback;
}

/** Erreurs DRF par champ ({ email: ["…"] } → { email: "…" }), pour les afficher sous chaque saisie. */
export function apiFieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !err.data || typeof err.data !== "object" || Array.isArray(err.data)) return {};
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(err.data as Record<string, unknown>)) {
    const message = Array.isArray(value) ? value.find((v): v is string => typeof v === "string") : value;
    if (typeof message === "string") result[field] = message;
  }
  return result;
}

// Un seul refresh à la fois : les requêtes en 401 simultanées attendent le même.
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();
  if (!refreshToken) return null;
  const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: refreshToken }),
  });
  if (!res.ok) {
    await logout();
    return null;
  }
  const data = await res.json();
  await setTokens(data.access, data.refresh ?? refreshToken);
  return data.access as string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = "GET", body, auth = true } = options;
  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth && !isRetry) {
    refreshing ??= refreshAccessToken().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return request<T>(path, options, true);
  }
  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const apiGet = <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
  request<T>(path, { ...options, method: "GET" });

export const apiPost = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
  request<T>(path, { ...options, method: "POST", body });

export const apiPatch = <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
  request<T>(path, { ...options, method: "PATCH", body });

export const apiDelete = <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
  request<T>(path, { ...options, method: "DELETE" });
