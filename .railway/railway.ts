import {
  bucket,
  defineRailway,
  group,
  postgres,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

export default defineRailway(() => {
  const database = postgres("Postgres");
  const cache = redis("Redis");
  const media = bucket("media", { region: "ams" });
  const kyc = bucket("kyc-private", { region: "ams" });

  const commonEnv = {
    DJANGO_SETTINGS_MODULE: "config.settings.prod",
    DJANGO_SECRET_KEY: preserve(),
    DJANGO_ALLOWED_HOSTS: preserve(),
    CORS_ALLOWED_ORIGINS: preserve(),
    FRONTEND_URL: preserve(),
    BACKEND_URL: preserve(),
    // Railway interroge le conteneur en HTTP pour ses healthchecks. Le TLS
    // public reste terminé par son proxy et signalé via X-Forwarded-Proto.
    SECURE_SSL_REDIRECT: "False",
    PAYMENT_SANDBOX: "True",
    POSTGRES_DB: database.env.PGDATABASE,
    POSTGRES_USER: database.env.PGUSER,
    POSTGRES_PASSWORD: database.env.PGPASSWORD,
    POSTGRES_HOST: database.env.PGHOST,
    POSTGRES_PORT: database.env.PGPORT,
    REDIS_URL: cache.env.REDIS_URL,
    MINIO_ACCESS_KEY: preserve(),
    MINIO_SECRET_KEY: preserve(),
    MINIO_ENDPOINT: preserve(),
    MINIO_BUCKET: preserve(),
    MINIO_USE_SSL: "True",
    S3_REGION_NAME: "auto",
    S3_ADDRESSING_STYLE: "virtual",
    S3_QUERYSTRING_AUTH: "True",
    S3_QUERYSTRING_EXPIRE: "3600",
    KYC_STORAGE_BACKEND: "s3",
    KYC_STORAGE_BUCKET: preserve(),
    KYC_S3_ACCESS_KEY: preserve(),
    KYC_S3_SECRET_KEY: preserve(),
    KYC_S3_ENDPOINT: preserve(),
    KYC_S3_REGION: "auto",
    KYC_S3_ADDRESSING_STYLE: "virtual",
    KYC_STORAGE_AUTO_CREATE: "False",
  };

  const api = service("api", {
    start: "/app/railway-entrypoint.sh",
    preDeploy: "python manage.py migrate --noinput",
    healthcheck: "/health/ready/",
    healthcheckTimeout: 120,
    replicas: 1,
    env: {
      ...commonEnv,
      PROCESS_TYPE: "web",
      RUN_MIGRATIONS: "False",
    },
  });

  const worker = service("worker", {
    start: "/app/railway-entrypoint.sh",
    replicas: 1,
    env: {
      ...commonEnv,
      PROCESS_TYPE: "worker",
    },
  });

  const scheduler = service("scheduler", {
    start: "/app/railway-entrypoint.sh",
    replicas: 1,
    env: {
      ...commonEnv,
      PROCESS_TYPE: "beat",
    },
  });

  return project("SUNU-MALL", {
    resources: [
      group("Backend", [api, worker, scheduler]),
      group("Data", [database, cache, media, kyc]),
    ],
  });
});
