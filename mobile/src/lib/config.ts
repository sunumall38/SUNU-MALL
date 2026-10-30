/** Variables d'environnement `EXPO_PUBLIC_*` (voir `.env.example`). */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://sunu-mall-api.onrender.com/api").replace(/\/$/, "");

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "https://sunu-mall.pages.dev").replace(/\/$/, "");

/** Origine du backend (sans `/api`), pour les médias servis en chemin relatif. */
export const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
