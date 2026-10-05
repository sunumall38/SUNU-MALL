import { Outlet } from "react-router-dom";

/**
 * Point d'extension de session. Le KYC ne déconnecte plus le vendeur : il
 * intervient seulement après l'approbation de la boutique et bloque alors
 * les fonctions de vente dans l'espace commerçant.
 */
export function KycSessionWatcher() {
  return <Outlet />;
}
