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
