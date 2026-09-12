# Déploiement Railway du backend

Le frontend reste déployé en dehors de Railway. Le projet Railway contient :

- `api` : Django + Gunicorn, avec migrations avant déploiement et healthcheck ;
- `worker` : tâches Celery ;
- `scheduler` : Celery Beat avec planification stockée dans PostgreSQL ;
- PostgreSQL et Redis gérés par Railway ;
- deux buckets privés S3 : médias et documents KYC.

La topologie est déclarée dans `.railway/railway.ts`. Le déploiement initial
envoie directement le dossier `backend/` avec la CLI Railway. La source GitHub
pourra être attachée à `develop` après fusion de la pull request.

## Secrets à renseigner

Avant le premier déploiement, renseigner dans chaque service applicatif :

- `DJANGO_SECRET_KEY` : valeur aléatoire longue ;
- `DJANGO_ALLOWED_HOSTS` : domaine Railway de l'API, domaine API final et
  `healthcheck.railway.app` pour les contrôles de santé Railway ;
- `CORS_ALLOWED_ORIGINS` : origine HTTPS exacte du frontend ;
- `FRONTEND_URL` : URL publique du frontend ;
- `BACKEND_URL` : URL publique de l'API, suffixée par `/api` ;
- les quatre identifiants du bucket média sous `MINIO_*` ;
- les quatre identifiants du bucket KYC sous `KYC_S3_*`.

Les identifiants de paiement, SMTP et Anthropic sont optionnels au démarrage.
`PAYMENT_SANDBOX=True` est volontairement conservé tant que les identifiants
marchands de production ne sont pas installés et validés.

## Commandes de contrôle

```bash
railway config plan
railway config apply
railway domain --service api
railway up backend --path-as-root --no-gitignore --service api
railway up backend --path-as-root --no-gitignore --service worker
railway up backend --path-as-root --no-gitignore --service scheduler
```

Une fois le domaine créé, mettre à jour `DJANGO_ALLOWED_HOSTS` et
`BACKEND_URL`, puis vérifier :

```bash
curl --fail https://DOMAINE-API/health/live/
curl --fail https://DOMAINE-API/health/ready/
```

Les buckets Railway sont privés. Les médias publics sont donc exposés par des
URLs S3 signées pendant une heure. Les pièces KYC utilisent un bucket et des
identifiants séparés, avec des URLs signées pendant cinq minutes.

Nginx, Prometheus, Grafana, Loki et Promtail du Compose ne sont pas recréés :
Railway termine TLS et fournit les logs et métriques de la plateforme. Promtail
ne peut par ailleurs pas lire le socket Docker d'un service Railway.
