# Backend et service email sur Railway

Le dépôt est prêt à déployer le backend Django depuis GitHub. L'envoi d'emails
utilise par défaut l'API HTTPS de Resend en production Railway. Ce choix évite
les ports SMTP, bloqués par Railway sur les offres Free, Trial et Hobby.

## 1. Préparer Resend

1. Ajoutez et validez votre domaine d'envoi dans Resend (enregistrements DNS).
2. Créez une clé API limitée au droit **Sending access**.
3. Gardez la clé hors du dépôt GitHub ; elle sera enregistrée uniquement dans
   les variables du service Railway.

Pour un premier essai sans domaine validé, utilisez l'adresse d'essai autorisée
par Resend et envoyez vers l'adresse du propriétaire du compte Resend. Passez
sur votre domaine avant l'ouverture au public.

## 2. Configurer le service backend Railway

Dans le service GitHub lié à `sunumall38/SUNU-MALL` :

- branche : la branche validée par votre workflow (`develop` pour la recette,
  puis `main` pour la production) ;
- **Root Directory** : `/backend` ;
- **Config File Path** : `/backend/railway.json` ;
- générez un domaine public Railway pour le service.

`railway.json` demande à Railway de :

- construire `backend/Dockerfile` ;
- appliquer les migrations avant la mise en ligne ;
- démarrer Django avec Gunicorn sur le port injecté par Railway ;
- vérifier `/health/live/` avant de router le trafic ;
- redémarrer le service en cas d'échec.

## 3. Ajouter PostgreSQL et Redis

Ajoutez un service PostgreSQL et un service Redis au même projet Railway, puis
déclarez dans le backend des variables de référence :

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
```

Le code continue aussi d'accepter `POSTGRES_HOST`, `POSTGRES_DB`, etc. pour les
déploiements Docker Compose existants.

## 4. Variables obligatoires du backend

Remplacez les exemples par les domaines réellement générés :

```text
DJANGO_SETTINGS_MODULE=config.settings.prod
DJANGO_SECRET_KEY=<longue-valeur-aléatoire>
DJANGO_ALLOWED_HOSTS=<backend>.up.railway.app

DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

EMAIL_PROVIDER=resend
RESEND_API_KEY=<clé-secrète-resend>
DEFAULT_FROM_EMAIL=SUNU MALL <noreply@votre-domaine.sn>
ADMIN_NOTIFICATION_EMAIL=admin@votre-domaine.sn

FRONTEND_URL=https://sunu-mall-sn.netlify.app
BACKEND_URL=https://<backend>.up.railway.app/api
CORS_ALLOWED_ORIGINS=https://sunu-mall-sn.netlify.app
```

Ajoutez également les variables de stockage MinIO/S3 et les clés métier
(paiement, IA) nécessaires à votre environnement. Le démarrage de production
refuse volontairement un service email absent ou une clé Resend vide : cela
évite de créer des comptes qui ne peuvent jamais recevoir leur lien de
vérification.

## 5. Connecter Netlify au nouveau backend

Dans Netlify, configurez puis redéployez le frontend :

```text
VITE_API_URL=https://<backend>.up.railway.app/api
```

Cette variable est intégrée au JavaScript au moment de la construction : une
simple modification sans nouveau déploiement ne suffit pas.

## 6. Vérifier après déploiement

Dans Railway, ouvrez le shell du service backend et exécutez :

```bash
python manage.py send_test_email votre-adresse@example.com
```

Le message `Email de test accepté` confirme que l'API du fournisseur a accepté
la requête. Vérifiez ensuite la réception et, dans Resend, l'état final
`Delivered`. Testez enfin une inscription depuis Netlify et ouvrez le lien reçu
pour confirmer que `FRONTEND_URL` est correct.

Pour diagnostiquer le déploiement :

- `/health/live/` vérifie uniquement que le processus Django répond ;
- `/health/ready/` vérifie les dépendances et renvoie une erreur si PostgreSQL
  est indisponible ;
- les échecs d'envoi sont journalisés sans exposer la clé API ;
- après chaque création de boutique, `ADMIN_NOTIFICATION_EMAIL` reçoit les
  informations du vendeur et un lien vers `/admin-shops`.

## Alternative SMTP

Sur Railway Pro, ou sur un autre hébergeur autorisant SMTP, utilisez
`EMAIL_PROVIDER=smtp` avec `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`,
`EMAIL_HOST_USER` et `EMAIL_HOST_PASSWORD`. Resend via HTTPS reste préférable
sur Railway pour la fiabilité et le suivi de délivrabilité.
