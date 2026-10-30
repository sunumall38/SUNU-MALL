# Journal des versions

Toutes les évolutions notables de SUNU MALL sont consignées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ;
numérotation : [SemVer](https://semver.org/lang/fr/) (voir `CONTRIBUTING.md`).

## [Non publié]

### Ajouté
- Partenaires de livraison : compte créé et lié depuis l'administration,
  factures mensuelles automatiques (tâches quotidiennes), coordonnées de
  versement (Wave, Orange Money, IBAN), liste des livraisons paginée.
- Une seule page de connexion pour tous les rôles ; champ téléphone avec
  l'indicatif +221 et le format guidé.

### Modifié
- Django 5.0 → 5.2 LTS (correctifs de sécurité jusqu'en avril 2028 ; la 5.0
  n'en reçoit plus depuis avril 2025), avec DRF 3.16, django-filter 25.1,
  drf-spectacular 0.28, SimpleJWT 5.5, django-celery-beat 2.8, WhiteNoise 6.9.
- Parcours vendeur : pièce d'identité d'abord, puis boutique ; l'administration
  rend une seule décision sur le dossier complet (boutique active et identité
  vérifiée, ou refus motivé). Un dossier refusé repart en examen dès que le
  vendeur corrige sa boutique ou renvoie sa pièce. Statuer exige les
  permissions `kyc.approve` / `kyc.reject`.
- Ventes en direct masquées (navigation, accueil, route) en attendant l'offre.
- Assistant de chat masqué tant que la clé IA n'est pas configurée ; le bouton
  de la page Contact propose d'appeler.
- Vraies coordonnées (téléphone, e-mail, adresse) et horaires de bureau ;
  plus de promesse de support 24/7.
- Configurations Railway et Netlify retirées ; script de démarrage renommé
  `entrypoint.sh`.

### Corrigé
- Parcours des premiers clients (tests de bout en bout) :
  - le vendeur est prévenu par e-mail de chaque commande payée, avec les
    articles à préparer ; le client d'une commande multi-boutiques reçoit
    aussi sa confirmation ;
  - le livreur qui se déclare « Disponible » envoie sa position GPS (sinon il
    n'apparaissait à aucun vendeur) ;
  - impossible d'affecter un livreur à une commande non payée ou à un retrait
    en boutique ; le retrait en boutique n'est plus confié automatiquement à
    un livreur ;
  - tableau de bord vendeur : bandeau tant que la boutique n'a pas de position
    GPS, erreurs d'affectation affichées, chiffre d'affaires limité aux
    commandes payées ;
  - le client peut payer une commande restée en attente (« Payer
    maintenant » sur le suivi) ;
  - statuts, moyens de paiement et étapes de livraison affichés en français ;
    montant formaté côté livreur ; frais de livraison détaillés dans le
    portefeuille vendeur ;
  - le vendeur ne peut plus « simuler » le paiement d'un client ;
  - liens des e-mails texte : `&amp;` n'est plus inséré dans les URL ;
  - masqués en phase pilote : bouton « Générer avec l'IA » (clé IA absente)
    et option « Retrait en boutique » (parcours de retrait à construire) ;
  - textes du paiement de test reformulés pour les testeurs ;
  - un article dont tout le stock était réservé par une commande abandonnée
    restait « en rupture » jusqu'au passage quotidien : la fiche produit
    libère désormais les commandes non payées expirées (au plus toutes les
    5 minutes).
- Suivi de livraison en direct : l'API répondait 406 à l'en-tête d'un
  navigateur, le suivi restait en rafraîchissement toutes les 10 s.
- Flux temps réel plafonnés (moitié des fils du serveur) : au-delà, la page
  de suivi passe au rafraîchissement périodique au lieu de bloquer l'API.
- Modifier la quantité d'un article du panier contrôle désormais le stock.
- Dernière position du livreur : deux points GPS de même horodatage sont
  départagés (la position affichée pouvait être l'avant-dernière).

### Sécurité
- Pillow 10.3 → 13.0 (66 failles connues sur le traitement des images
  envoyées : photos de produits, pièces d'identité) et Django REST Framework
  3.16 → 3.18.3 (contournement de la taille maximale des requêtes, déni de
  service par l'en-tête Accept) : `pip-audit` ne signale plus rien.
- Partenaire suspendu en lecture seule : plus de modification de ses
  réglages ni de son compte de versement.
- Mot de passe provisoire (livreurs, partenaires) : son changement est imposé
  par l'API elle-même, plus seulement par l'interface ; avant, le compte
  restait utilisable avec le mot de passe provisoire.
- Coordonnées de versement des partenaires : mot de passe exigé à chaque
  modification, administration alertée par e-mail, changement récent signalé
  sur les factures à régler ; IBAN contrôlé (clé mod 97) et numéro mobile
  exigé pour Wave / Orange Money.
- Factures partenaires (coordonnées bancaires, « marquer payée ») réservées au
  super admin et à l'administration financière ; double validation impossible.
- Un partenaire sans compte lié ne peut plus être activé, quelle que soit la
  voie (action, modification directe, administration Django).
- Les e-mails de facture partent après validation de l'enregistrement : plus
  d'envoi d'une facture ensuite annulée.

### Interne
- Documentation OpenAPI : les classes d'authentification du projet sont
  reconnues (Swagger garde l'authentification Bearer).
- CI backend : lint ruff, contrôle des migrations manquantes, `pytest` (qui
  exécute aussi `backend/tests/`).

## [1.0.0] - 2026-10-28

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
