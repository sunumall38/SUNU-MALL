# Journal des versions

Toutes les évolutions notables de SUNU MALL sont consignées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ;
numérotation : [SemVer](https://semver.org/lang/fr/) (voir `CONTRIBUTING.md`).

## [Non publié]

Première version de production : plateforme hébergée sur Render (API) et
Cloudflare Pages (boutique), paiement réel Wave et Orange Money.

### Ajouté
- Paiement Wave et Orange Money de bout en bout : redirection vers la page
  sécurisée de l'opérateur, page de retour `/paiement/retour` qui fait
  confirmer le statut par le serveur, relance d'un paiement non abouti,
  paiement des abonnements vendeurs.
- Vérification du statut directement chez Wave / Orange Money quand une
  notification se perd (`POST /api/payments/{id}/refresh/`).
- Remboursement Wave par API depuis l'administration.
- `GET /api/payments/methods/` : seuls les moyens réellement configurés sont
  proposés aux clients.
- « Mot de passe oublié » : lien de réinitialisation à usage unique par email,
  sessions existantes révoquées.
- Formulaire de contact traité par le serveur (enregistré + email à l'équipe,
  anti-robots, limite de débit).
- Gestion des versions : fichier `VERSION`, `GET /api/version/`, version
  affichée en pied de page, historique automatique des déploiements,
  `scripts/release.sh` et publication des releases GitHub sur tag.
- Déploiement Render (`render.yaml`) + Cloudflare Pages, traitements
  quotidiens sans worker (`manage.py run_daily_tasks`).

### Modifié
- Écrans chargés à la demande : bundle initial divisé par près de deux.
- Contrôles de santé publics réduits au statut ; détail réservé aux
  administrateurs (`/api/ops/health/`).
- Un paiement d'abonnement abandonné est repris ou remplacé au lieu de
  bloquer le commerçant.

### Corrigé
- Stock : rendu à l'annulation ; une commande non payée sous 2 h est annulée
  et libère ses articles ; réservation atomique (plus de survente du dernier
  article).
- Annulation impossible dès que le colis a quitté la boutique (plus de
  remboursement d'un colis en cours de livraison).
- Un paiement arrivé après l'annulation laisse la commande annulée et ouvre
  un remboursement ; une confirmation rejouée ne refait plus rien.
- Livraison : le code de remise fonctionne aussi « en transit » et « en
  livraison » (les courses pouvaient ne jamais se terminer), code créé à la
  dernière collecte d'une mission multi-boutiques, « Signaler un échec »
  réparé, confirmation multi-boutiques côté client.
- Multi-boutiques : fonds des vendeurs libérés après livraison, annulation
  d'une seule boutique avec remboursement de sa part, contre-passation des
  ventes de chaque vendeur, remboursements visibles par le client, achats
  personnels d'un commerçant visibles.
- Portefeuilles vendeurs et plateforme modifiés sous verrou (plus d'écriture
  écrasée entre une vente et un retrait).
- Suivi en direct limité à des connexions de 50 s qui se renouvellent : il
  ne peut plus bloquer le serveur.
- Achat d'un produit inactif ou panier vide refusés aussi pour une boutique
  unique ; suggestion de livreurs (méthode HTTP) réparée.
- Plus aucun repli silencieux sur le paiement simulé en production ; la carte
  bancaire, sans passerelle, n'est plus proposée hors mode test.
- Webhook Wave : montant et devise contrôlés, événements secondaires acquittés.
- Orange Money : nouvelle référence à chaque tentative (Orange refuse les
  doublons), notifications d'anciennes tentatives acceptées.
- Un paiement réglé ou remboursé ne peut plus repasser en échec.
- Redirection après connexion : `//hôte` et `/\hôte` ne sortent plus du site.
- Pages Supervision et Urgence de l'administration (URL de santé erronée).
- Accessibilité : nom accessible sur toutes les listes déroulantes.

### Sécurité
- Dépendances frontend mises à jour (React Router 7, Vite 7, Vitest 4,
  Zod 4) : `npm audit` passe de 17 alertes, dont 2 critiques, à 0.

## [0.9.0] - 2026-10-05

État du dépôt avant la phase de clôture : marketplace complète (boutiques,
catalogue, commandes multi-boutiques, livraison suivie en temps réel, KYC
vendeurs et livreurs, abonnements, commissions, support, administration),
connexion par téléphone avec vérification SMS Twilio, emails par l'API Gmail,
paiements Wave / Orange Money en mode simulé.
