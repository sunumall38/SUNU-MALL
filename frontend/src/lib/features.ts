/**
 * Fonctionnalités activables à la construction du frontend. Une
 * fonctionnalité désactivée disparaît de la navigation et de la page
 * d'accueil, et sa route renvoie vers le tableau de bord ; son code reste en
 * place pour pouvoir la réactiver en changeant une seule valeur.
 */
export const FEATURES = {
  /** Ventes en direct (espace vendeur) : masquées tant que l'offre n'est pas prête. */
  liveSales: false,
} as const;
