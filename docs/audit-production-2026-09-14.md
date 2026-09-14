# Rapport d'audit — SUNU MALL

**Date :** 14 septembre 2026  
**Environnements :** frontend Netlify `https://sunu-mall-sn.netlify.app`, API Railway `https://api-production-89a4.up.railway.app`  
**Branche d'implémentation :** `feature/railway-email-service` (basée sur `develop`)

## 1. Résumé exécutif

Le frontend et l'API sont en ligne, communiquent correctement en HTTPS et le
CORS autorise bien l'origine Netlify. Les principales pages publiques se
chargent et aucune image cassée n'a été détectée sur les écrans testés.

La plateforme n'est toutefois pas prête pour une ouverture commerciale : la
base de production ne contient aucune catégorie, aucun produit et aucune
boutique active. Un défaut responsive provoque aussi un défilement horizontal
sur mobile. Enfin, les dépendances frontend présentent des alertes de sécurité,
dont une vulnérabilité runtime importante dans React Router.

L'intégration email Railway a été ajoutée avant cet audit. Elle utilise Resend
via HTTPS, car Railway désactive SMTP sur les offres Free, Trial et Hobby et
recommande un fournisseur transactionnel par API. La livraison réelle ne peut
être validée qu'après ajout d'une clé Resend et d'un expéditeur validé dans les
variables Railway.

## 2. Périmètre et méthode

- parcours visuels à 1280 × 720 et 390 × 844 ;
- pages : accueil, catégories, boutiques, recherche, contact, connexion,
  inscriptions client/vendeur, panier, favoris, abonnements, suivi et pages
  légales ;
- contrôle des images cassées, largeur du document et noms accessibles ;
- appels directs à l'API : santé, catalogue, schéma et validation
  d'inscription ;
- contrôle CORS depuis l'origine Netlify ;
- build Docker du backend, contrôles Django et tests backend ciblés ;
- build, tests, lint et audit de dépendances du frontend.

Les paiements, commandes, livraisons, comptes connectés et l'envoi réel d'un
email n'ont pas été exécutés : la production ne contient aucun catalogue et
aucun compte de test contrôlé ni secret Resend n'a été fourni. Aucun compte ou
paiement réel n'a été créé pendant l'audit.

## 3. Résultats vérifiés

| Contrôle | Résultat |
|---|---|
| Frontend Netlify | HTTP 200, HTTPS/HSTS actif |
| API Railway | en ligne, santé agrégée `ok` |
| PostgreSQL, Redis, stockage | `ok` lors du contrôle public |
| CORS Netlify → Railway | conforme : origine, méthodes et en-têtes autorisés |
| Validation API inscription | HTTP 400 correct sur requête vide, sans création |
| Build frontend | réussi |
| Tests frontend | 68/68 réussis |
| Lint frontend | réussi |
| Build Docker backend initial | échec : dépendance `drf-spectacular` manquante |
| Build Docker après correctif | réussi |
| Tests backend auth + ops | 62/62 réussis |
| Configuration production Resend | contrôle réussi avec variables factices |
| Garde-fou clé Resend absente | démarrage refusé comme prévu |
| Commande d'email de test | réussie avec backend mémoire, sans envoi externe |

## 4. Bugs et risques

### P0 — Bloquants avant ouverture

#### P0-1 — Catalogue de production entièrement vide

**Reproduction :** ouvrir l'accueil, `/category`, `/boutiques` ou `/search`,
puis appeler les endpoints catalogue. Les trois réponses API ont `count: 0` :
catégories, produits et boutiques.

**Impact :** aucun achat n'est possible ; les sections Catégories populaires,
Sponsorisé et Meilleures ventes sont vides, tandis que Nouveautés affiche un
état vide.

**Correctif recommandé :** charger et valider le catalogue de production depuis
l'administration ou une procédure d'import dédiée. Ne pas exécuter un seed de
démo sans validation métier : il pourrait publier de faux vendeurs/prix.

#### P0-2 — Le Dockerfile du dépôt ne construisait pas le backend

**Reproduction :** construction de `backend/Dockerfile` depuis `develop` :
`ModuleNotFoundError: No module named 'drf_spectacular'` pendant
`collectstatic`.

**Impact :** un nouveau déploiement Railway configuré avec le Dockerfile échoue
avant démarrage.

**État : corrigé dans la branche d'implémentation** en ajoutant la dépendance
manquante. Le build complet passe désormais.

### P1 — Élevés

#### P1-1 — Débordement horizontal sur mobile

**Reproduction :** largeur 390 px, après chargement complet. Le document mesure
504 px sur l'accueil, les catégories, les boutiques, la recherche, le contact,
le panier, les favoris et les pages légales. La zone Favoris/Panier/Compte sort
à droite de l'écran et la navigation est tronquée.

**Impact :** éléments d'en-tête partiellement invisibles, geste horizontal
involontaire et expérience dégradée sur smartphone.

**Cause probable :** les éléments flexibles de la barre de recherche n'ont pas
`min-width: 0`, tandis que les actions de compte conservent une largeur fixe.

**Correctif recommandé :** ajouter `min-w-0` au formulaire et à l'input,
réduire/masquer certains contrôles sous 640 px et ajouter un test de non-
débordement aux largeurs 320, 360, 390 et 430 px.

#### P1-2 — Dépendances frontend vulnérables

`npm audit` signale **12 vulnérabilités : 1 critique, 9 élevées, 2 modérées**.
Les alertes Vite/Vitest concernent surtout l'environnement de développement,
mais `react-router-dom` 6.23.1 est une dépendance runtime et possède des avis
d'open redirect/XSS. Des mises à jour non majeures sont proposées, notamment
React Router 6.30.6, Vite 5.4.21, Vitest 1.6.1 et PostCSS 8.5.28.

**Impact :** risque de redirection ouverte/XSS dans certains scénarios et risque
élevé sur les postes de développement si les serveurs de test sont exposés.

**Correctif recommandé :** mettre à jour dans une branche sécurité, relancer les
68 tests, le build et un audit des parcours `next`/redirections avant fusion.

#### P1-3 — Email transactionnel non vérifiable sur la production actuelle

Le code historique utilisait la console par défaut ou SMTP. Or SMTP est bloqué
sur Railway Free/Trial/Hobby. Sans accès aux variables Railway et sans compte de
test autorisé, il est impossible d'affirmer que les emails actuels quittent le
conteneur.

**État : implémentation livrée** avec Resend via HTTPS, variables strictement
validées, commande `send_test_email` et guide de déploiement. Il reste à ajouter
la clé et le domaine expéditeur dans Railway, déployer, puis vérifier l'état
`Delivered` chez Resend.

### P2 — Moyens

#### P2-1 — Formulaire de contact sans envoi serveur

Le bouton ouvre un lien `mailto:` puis affiche immédiatement un message de
succès. Si aucun client mail n'est configuré ou si l'utilisateur ferme le
brouillon, SUNU MALL ne reçoit rien, mais l'interface laisse entendre que la
prise en charge est faite.

**Correctif recommandé :** créer un endpoint contact protégé par limitation de
débit/anti-spam, envoyer via le même service transactionnel et n'afficher le
succès qu'après réponse du serveur. Conserver `mailto:` comme solution de
secours explicite.

#### P2-2 — Aucun parcours « mot de passe oublié »

La page de connexion ne propose ni lien ni endpoints visibles de demande et de
confirmation de réinitialisation.

**Impact :** un utilisateur qui perd son mot de passe ne peut pas récupérer son
compte en autonomie.

#### P2-3 — Accessibilité incomplète

- le bouton de recherche n'a plus de nom accessible lorsque son texte est
  masqué sur mobile ;
- le sélecteur du type de pièce d'identité vendeur n'a pas de label accessible.

**Correctif recommandé :** ajouter `aria-label="Rechercher"` au bouton et un
`label` associé au sélecteur. Compléter avec un audit clavier et lecteur d'écran.

#### P2-4 — Sonde de vie trop lourde dans la production actuelle

`/health/live/` exécute actuellement les contrôles PostgreSQL, Redis et stockage.
Cinq appels chauds ont pris environ 0,41 à 0,67 s et une requête de prévol a
expiré une fois à 12 s avant de réussir au nouvel essai.

**Impact :** une dépendance lente peut faire croire à Railway que le processus
web est mort et empêcher un déploiement sain.

**État : corrigé dans la branche d'implémentation** : la sonde de vie répond
uniquement `{"status":"ok"}` ; les dépendances restent sur `/health/ready/`.

#### P2-5 — Informations techniques exposées par les contrôles de santé

Les endpoints publics agrégés renvoient les noms des dépendances, leurs latences
et, en cas d'échec, le texte brut de l'exception. Cela peut exposer des détails
d'infrastructure.

**Correctif recommandé :** réserver les détails aux administrateurs/au réseau
interne et ne publier que `ok`, `degraded` ou `down`.

#### P2-6 — Chargement JavaScript trop lourd

Le build produit un bundle principal de **805,85 kB** (209,17 kB gzip), au-dessus
du seuil d'avertissement Vite. Le routeur importe presque tous les écrans de
façon statique.

**Impact :** premier affichage plus lent sur réseau mobile et appareils modestes.

**Correctif recommandé :** chargement différé par espace et par route
(marketplace, vendeur, livreur, partenaire, admin), puis mesure Lighthouse sur
un profil mobile.

#### P2-7 — En-têtes de sécurité frontend incomplets

Netlify renvoie HSTS, mais aucun CSP, `X-Content-Type-Options`, protection
d'intégration en iframe, `Referrer-Policy` ou `Permissions-Policy` n'a été
observé sur l'accueil.

**Correctif recommandé :** ajouter un fichier `_headers` Netlify avec une CSP
testée, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy` et `frame-ancestors`.

### P3 — Faibles / qualité

- toutes les routes partagent le titre générique « Sunu Mall » et aucune méta-
  description n'est définie : SEO et partage social limités ;
- une URL inconnue redirige silencieusement vers l'accueil au lieu d'afficher
  une page 404 explicite ;
- le badge public Netlify recouvre une partie du contenu en bas à droite sur
  mobile ;
- le CTA « Découvrir les boutiques » pointe vers `/search`, pas `/boutiques` ;
- « Promotions » pointe vers une recherche générale, sans filtre promotionnel ;
- la FAQ contient « puis activés votre disponibilité » au lieu de « puis
  activez votre disponibilité » ;
- `django check --deploy` produit 112 avertissements de schéma OpenAPI : plusieurs
  endpoints et champs sont mal ou non décrits, ce qui réduit la fiabilité de la
  documentation API sans empêcher le runtime.

Les coordonnées et mentions légales visibles (adresse, téléphones, raison
sociale, RCCM, contacts) doivent être validées par le responsable juridique
avant ouverture ; leur exactitude ne peut pas être confirmée techniquement.

## 5. Implémentation email Railway livrée

- fournisseur Resend/Anymail via API HTTPS ;
- conservation d'un mode SMTP pour Railway Pro/autres hébergeurs ;
- refus de démarrer en production si le backend console, la clé Resend ou
  l'expéditeur sont absents ;
- support natif de `DATABASE_URL` Railway avec connexions persistantes ;
- `backend/railway.json` : build Docker, migrations, Gunicorn, port dynamique,
  healthcheck et politique de redémarrage ;
- commande `python manage.py send_test_email <destinataire>` ;
- journalisation du succès/échec fournisseur sans clé secrète ;
- documentation des variables Railway, de la liaison PostgreSQL/Redis et de la
  variable Netlify `VITE_API_URL`.

## 6. Plan de mise en production recommandé

1. Fusionner/déployer la branche email après revue.
2. Ajouter dans Railway `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`,
   `DEFAULT_FROM_EMAIL`, `DATABASE_URL`, `REDIS_URL`, les domaines et secrets
   Django décrits dans `docs/railway-email.md`.
3. Valider le domaine Resend, envoyer un email de test et confirmer `Delivered`.
4. Charger un catalogue de production validé.
5. Corriger le débordement mobile et les vulnérabilités runtime.
6. Exécuter un test bout en bout contrôlé : inscription, vérification email,
   connexion, panier, paiement sandbox, commande et suivi.
7. Traiter ensuite contact, récupération de mot de passe, en-têtes de sécurité,
   accessibilité et découpage du bundle.

## 7. Références techniques

- [Railway — Outbound networking et email](https://docs.railway.com/networking/outbound-networking)
- [Railway — Déployer un monorepo](https://docs.railway.com/deployments/monorepo)
- [Railway — Pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)
- [Anymail — Backend Resend](https://anymail.dev/en/v13.0/esps/resend.html)
- [GitHub Advisory — React Router XSS/open redirect](https://github.com/advisories/GHSA-2w69-qvjg-hvjx)
