# Déploiement Render (API) + Cloudflare Pages (frontend)

Hébergement de la phase de démonstration, sur des offres gratuites :

| Brique | Où | Fichier de référence |
| --- | --- | --- |
| API Django | Render, service web Docker | `render.yaml` |
| PostgreSQL | Render, base gratuite | `render.yaml` |
| Redis (temps réel du suivi de livraison) | Render Key Value | `render.yaml` |
| Frontend React | Cloudflare Pages | `frontend/public/_headers` |
| Images et pièces KYC | Stockage S3 externe (deux buckets) | variables `MINIO_*` / `KYC_*` |

Il n'y a plus de worker ni de scheduler Celery : les deux traitements
quotidiens (expiration des abonnements, libération des fonds vendeurs) sont
lancés au démarrage de l'API par `manage.py run_daily_tasks --if-due`, au plus
une fois par jour.

## Limites de l'offre gratuite

- L'API **s'endort après 15 minutes sans trafic** : la première requête
  suivante attend son réveil (plusieurs dizaines de secondes).
- La base PostgreSQL gratuite **expire 30 jours après sa création**, puis est
  supprimée 14 jours plus tard. Avant l'échéance : passer à une base payante
  ou changer `DATABASE_URL` vers une base hébergée ailleurs.
- Le Key Value gratuit ne garde rien sur disque (sans conséquence ici : il ne
  porte que des messages temps réel).
- Les traitements quotidiens ne passent que si l'API démarre au moins une fois
  dans la journée. Pour les forcer :
  `python manage.py run_daily_tasks` depuis le Shell Render.

## 1. Stockage S3 (avant tout)

Créer deux buckets **privés** chez un fournisseur compatible S3 : un pour les
médias, un pour les pièces KYC. Noter l'endpoint, la région, la clé d'accès et
la clé secrète. `config.settings.prod` refuse de démarrer si les identifiants
de stockage sont ceux par défaut du dépôt.

## 2. API sur Render

1. Render → **New → Blueprint**, choisir le dépôt et la branche `main`.
   Render lit `render.yaml` et propose le service web, la base et le Key Value.
2. Renseigner les variables demandées :

   | Variable | Valeur |
   | --- | --- |
   | `FRONTEND_URL` | Adresse Cloudflare Pages, sans barre finale. Provisoire à ce stade : on la corrige à l'étape 4 |
   | `CORS_ALLOWED_ORIGINS` | La même adresse |
   | `RESEND_API_KEY` | Clé Resend (droit d'envoi uniquement) |
   | `DEFAULT_FROM_EMAIL` | Adresse d'un domaine validé dans Resend |
   | `ADMIN_NOTIFICATION_EMAIL` | Boîte qui reçoit les demandes de boutique |
   | `MINIO_ENDPOINT` | Endpoint S3, avec `https://` |
   | `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Identifiants S3 |
   | `MINIO_BUCKET` | Bucket des médias |
   | `KYC_STORAGE_BUCKET` | Bucket privé des pièces KYC |
   | `S3_REGION_NAME` | Région du fournisseur S3 |

3. Lancer le déploiement. Les migrations passent au démarrage.
4. Vérifier `https://<service>.onrender.com/health/live/` → `{"status":"ok"}`,
   puis `/health/ready/` pour l'état de la base, de Redis et du stockage.

Le nom d'hôte Render est accepté automatiquement (`RENDER_EXTERNAL_HOSTNAME`)
et sert d'URL publique de l'API pour les webhooks de paiement. Avec un domaine
personnalisé, renseigner `DJANGO_ALLOWED_HOSTS` et `BACKEND_URL`.

## 3. Frontend sur Cloudflare Pages

Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, puis :

| Réglage | Valeur |
| --- | --- |
| Production branch | `main` |
| Root directory | `frontend` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variable `VITE_API_URL` | `https://<service>.onrender.com/api` |
| Variable `NODE_VERSION` | `20` |

Les routes de l'application (`/cart`, `/merchant`…) fonctionnent sans réglage :
sans fichier `404.html`, Pages sert `index.html` pour toute route inconnue.
Les en-têtes de sécurité viennent de `frontend/public/_headers`.

## 4. Relier les deux

Dans Render, mettre `FRONTEND_URL` et `CORS_ALLOWED_ORIGINS` à l'adresse
définitive `https://<projet>.pages.dev`, puis redéployer l'API. Sans cela le
navigateur bloque les appels (CORS) et les liens des emails pointent ailleurs.

## 5. Comptes et données

- Base neuve : `python manage.py create_admin --email … --password …` depuis
  le Shell Render (ne pas garder le mot de passe par défaut).
- Reprise de l'ancienne base : `pg_dump -Fc` de l'ancienne, puis `pg_restore`
  vers l'**External Database URL** de la base Render, avant la première mise
  en service.

## Avant l'ouverture commerciale

Passer `PAYMENT_SANDBOX` à `False` avant d'installer les clés Wave / Orange
Money, et quitter l'offre gratuite (API qui dort, base qui expire).
