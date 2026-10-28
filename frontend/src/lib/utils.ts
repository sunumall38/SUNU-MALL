import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(amount: number | string) {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

/** Temps de trajet estimé (SSE/API) en libellé lisible, ex. « ~8 min ». */
export function formatEta(seconds: number | null | undefined) {
  if (seconds == null) return null;
  if (seconds <= 0) return "Arrivée imminente";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `~${minutes} min`;
}

/**
 * Chemin interne sûr pour une redirection après connexion (`?next=`).
 * Refuse tout ce qui pourrait sortir du site : URL absolue, « //hôte »,
 * barre oblique inverse (« /\hôte » est lu comme « //hôte » par les
 * navigateurs) et caractères de contrôle.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f]/.test(raw)) return null;
  return raw;
}
