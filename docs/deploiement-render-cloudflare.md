# Déploiement Render (API) + Cloudflare Pages (boutique)

| Brique | Où | Fichier de référence |
| --- | --- | --- |
| API Django | Render, service web Docker (offre gratuite) | `render.yaml`, `Dockerfile` |
| PostgreSQL | Base durable (Neon gratuit ou Render payant) | variable `DATABASE_URL` |
| Redis (temps réel du suivi de livraison) | Render Key Value gratuit | `render.yaml` |
| Boutique React | Cloudflare Pages | `frontend/public/_headers` |
| Images et pièces d'identité | Stockage compatible S3 (deux buckets) | variables `MINIO_*` / `KYC_*` |
| Emails | API Gmail du compte sunumall38@gmail.com | variables `GMAIL_*` |

Pas de worker ni de scheduler Celery : les traitements quotidiens (abonnements
échus, libération des fonds vendeurs) tournent au démarrage de l'API
(`run_daily_tasks --if-due`, au plus une fois par jour).

Ordre conseillé : 1 → 2 → 3 → 4 → 5, puis 6 quand les contrats marchands
Wave / Orange Money sont signés.

## Limites de l'offre gratuite

- L'API **s'endort après 15 minutes sans trafic** : la première requête
  suivante attend son réveil (30 à 60 s). Wave réessaie ses notifications, et
  la page de retour de paiement revérifie le statut : aucun paiement n'est
  perdu, mais l'attente est visible. Passer au plan *Starter* à l'ouverture.
- **Pas de Shell** sur Render gratuit : le premier administrateur est créé au
  démarrage (variables `ADMIN_BOOTSTRAP_*`, étape 3).
- La base PostgreSQL gratuite **de Render** est supprimée au bout de 30 jours
  (+ 14 jours de grâce). D'où l'étape 1.

## 1. Base de données durable

Recommandé : **Neon** (offre gratuite, sans carte bancaire, sans expiration).

1. Créer un compte sur neon.tech, projet `sunu-mall`, région **Frankfurt**
   (la même que Render, pour la latence).
2. Copier la *connection string* (format `postgresql://…?sslmode=require`).
3. Elle servira de `DATABASE_URL` à l'étape 3, à la place de la base Render.

Sans Neon, on peut garder la base gratuite de Render pour une démonstration,
en sachant qu'elle disparaît au bout de 30 jours.

## 2. Stockage des fichiers (S3)

Il faut deux buckets **privés** : un pour les images, un pour les pièces
d'identité KYC. Recommandé : **Backblaze B2** (10 Go gratuits, sans carte).

1. backblaze.com → *B2 Cloud Storage* → créer `sunumall-media` et
   `sunumall-kyc`, tous deux *Private*.
2. *Application Keys* → nouvelle clé limitée à ces deux buckets.
3. Noter : l'endpoint (`https://s3.<région>.backblazeb2.com`), la région
   (`<région>`, ex. `eu-central-003`), le *keyID* et l'*applicationKey*.

L'API refuse de démarrer si les identifiants de stockage sont ceux, publics,
du dépôt (`minioadmin`).

## 3. API sur Render

1. render.com → **New → Blueprint** → dépôt `sunumall38/SUNU-MALL`, branche
   `main`. Render lit `render.yaml` et propose le service web, la base et le
   Key Value.
2. Renseigner les variables demandées :

   | Variable | Valeur |
   | --- | --- |
   | `FRONTEND_URL` | `https://sunu-mall.pages.dev` (provisoire, corrigée à l'étape 5) |
   | `CORS_ALLOWED_ORIGINS` | la même adresse |
   | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | identifiants OAuth du compte Gmail (encadré ci-dessous) |
   | `DEFAULT_FROM_EMAIL` | `SUNU MALL <sunumall38@gmail.com>` |
   | `ADMIN_NOTIFICATION_EMAIL` | boîte qui reçoit les demandes de boutique et les messages de contact |
   | `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PHONE`, `ADMIN_BOOTSTRAP_PASSWORD` | premier super-administrateur |
   | `MINIO_ENDPOINT` | endpoint S3 de l'étape 2, avec `https://` |
   | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | clé de l'étape 2 |
   | `MINIO_BUCKET` | `sunumall-media` |
   | `KYC_STORAGE_BUCKET` | `sunumall-kyc` |
   | `S3_REGION_NAME` | région de l'étape 2 |

   **Identifiants Gmail** (une fois, connecté avec sunumall38@gmail.com) :
   console.cloud.google.com → nouveau projet → *APIs & Services* → activer
   **Gmail API** → *OAuth consent screen* : type *External*, puis **Publish
   app** (en mode *Testing*, le jeton expire au bout de 7 jours) →
   *Credentials* → *Create credentials → OAuth client ID* de type *Web
   application*, URI de redirection `https://developers.google.com/oauthplayground`.
   Sur developers.google.com/oauthplayground : roue dentée → *Use your own
   OAuth credentials* (ID et secret du client), scope
   `https://www.googleapis.com/auth/gmail.send`, *Authorize APIs* avec le
   compte sunumall38, puis *Exchange authorization code for tokens* : le
   **Refresh token** affiché est `GMAIL_REFRESH_TOKEN`.

3. Base durable : dans le service web → *Environment*, remplacer
   `DATABASE_URL` par l'URL Neon de l'étape 1 (on peut ensuite supprimer la
   base Render).
4. Lancer le déploiement. Au démarrage : migrations, enregistrement de la
   version, création de l'administrateur, traitements quotidiens.
5. Vérifier :
   - `https://<service>.onrender.com/health/live/` → `{"status":"ok"}` ;
   - `/health/ready/` → `{"status":"ok"}` (base, Redis, stockage) ;
   - `/api/version/` → la version publiée (`1.0.0`) et le commit.
6. Se connecter à l'administration avec le compte `ADMIN_BOOTSTRAP_*`,
   changer le mot de passe, puis **supprimer `ADMIN_BOOTSTRAP_PASSWORD`**
   des variables Render.

Le nom d'hôte `*.onrender.com` est accepté automatiquement et sert d'URL
publique pour les notifications de paiement. Avec un domaine personnalisé
(ex. `api.sunumall.sn`), renseigner `DJANGO_ALLOWED_HOSTS` et `BACKEND_URL`.

## 4. Boutique sur Cloudflare Pages

Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** →
`sunumall38/SUNU-MALL`, puis :

| Réglage | Valeur |
| --- | --- |
| Production branch | `main` |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable `VITE_API_URL` | `https://<service>.onrender.com/api` |
| Variable `NODE_VERSION` | `22` |

Les routes de l'application (`/cart`, `/merchant`…) fonctionnent sans
réglage : sans fichier `404.html`, Pages sert `index.html` pour toute route
inconnue. Les en-têtes de sécurité viennent de `frontend/public/_headers`.
La version et le commit construits s'affichent en pied de page.

## 5. Relier les deux

Dans Render, mettre `FRONTEND_URL` et `CORS_ALLOWED_ORIGINS` à l'adresse
définitive `https://<projet>.pages.dev` (ou au domaine personnalisé), puis
redéployer l'API. Sans cela le navigateur bloque les appels (CORS) et les
liens des emails et des paiements pointent ailleurs.

Contrôle final, dans un navigateur :
1. inscription d'un client (email reçu ?) puis « mot de passe oublié » ;
2. message depuis la page Contact (reçu sur `ADMIN_NOTIFICATION_EMAIL`) ;
3. commande test en mode simulé (`PAYMENT_SANDBOX=True`) jusqu'à
   « Commande confirmée » ;
4. page « Déploiements » de l'administration : la version `1.0.0` est active.

## 6. Paiements réels Wave et Orange Money

Tant que `PAYMENT_SANDBOX=True`, les paiements sont simulés et la boutique
l'indique. Quand les comptes marchands sont ouverts :

### Wave Business

1. business.wave.com → *Développeurs* → créer une **clé API** avec l'accès
   *Checkout API*.
2. Créer un **webhook** : URL `https://<service>.onrender.com/api/payments/webhook/wave/`,
   événements `checkout.session.completed` (et `checkout.session.payment_failed`
   si proposé), méthode de sécurité **signature** ; noter le secret.
3. Render : `WAVE_API_KEY` et `WAVE_WEBHOOK_SECRET`.

### Orange Money (Web Payment)

1. developer.orange.com → souscrire à *Orange Money Web Payment* (Sénégal),
   dossier marchand (NINEA, RCCM, RIB) ; validation par Orange.
2. Noter le *client ID*, le *client secret* et la *merchant key*.
3. Render : `ORANGE_MONEY_CLIENT_ID`, `ORANGE_MONEY_CLIENT_SECRET`,
   `ORANGE_MONEY_MERCHANT_KEY`. L'URL de notification est transmise à chaque
   paiement, rien à déclarer chez Orange.
4. Pour tester d'abord dans l'environnement de test d'Orange (argent
   fictif) : `ORANGE_MONEY_COUNTRY_PATH=dev` (la devise passe d'elle-même à
   `OUV`). Remettre `sn` pour la production.

### Bascule

1. Render : `PAYMENT_SANDBOX=False` **en même temps** que les clés (l'API
   refuse de démarrer avec des clés réelles en mode simulé, ou avec une clé
   Wave sans secret de webhook).
2. La boutique ne propose que les moyens dont les clés sont présentes
   (`GET /api/payments/methods/`) : on peut ouvrir Wave avant Orange Money.
3. Faire un vrai paiement de 100 FCFA avec chaque moyen, vérifier la commande
   « payée », puis le rembourser depuis l'administration (Wave : remboursement
   automatique par l'API ; Orange Money : à faire depuis l'espace marchand
   Orange, puis valider dans l'administration).

## SMS (facultatif)

Par défaut (`PHONE_OTP_PROVIDER=local`) les comptes s'activent par email et
l'option SMS est masquée. Avec un compte Twilio Verify : ajouter
`TWILIO_VERIFY_SERVICE_SID` et `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`,
puis `PHONE_OTP_PROVIDER=twilio`.

## Reprise d'une ancienne base

`pg_dump -Fc` de l'ancienne base, puis `pg_restore` vers l'URL de la nouvelle
**avant** la première mise en service.
