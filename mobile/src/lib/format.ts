import { API_ORIGIN } from "@/lib/config";

/** 12000 → « 12 000 FCFA » (sans dépendre des données de langue d'Intl). */
export function formatPrice(amount: number | string) {
  const value = Math.round(typeof amount === "string" ? parseFloat(amount) : amount);
  if (!Number.isFinite(value)) return "—";
  return `${String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/** Les médias sont en URL absolue (stockage S3) ; un chemin relatif vient d'un backend local. */
export function mediaUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith("/") ? `${API_ORIGIN}${url}` : url;
}

/** « Il y a 2 heures », « Il y a 3 jours ». */
export function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
}
