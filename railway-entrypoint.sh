#!/bin/sh
set -eu

case "${PROCESS_TYPE:-web}" in
  web)
    exec gunicorn config.wsgi:application \
      --bind "0.0.0.0:${PORT:-8000}" \
      --workers "${WEB_CONCURRENCY:-2}" \
      --threads "${GUNICORN_THREADS:-4}" \
      --timeout "${GUNICORN_TIMEOUT:-120}" \
      --access-logfile - \
      --error-logfile -
    ;;
  worker)
    exec celery -A config worker \
      --loglevel "${CELERY_LOG_LEVEL:-INFO}" \
      --concurrency "${CELERY_CONCURRENCY:-2}"
    ;;
  beat|scheduler)
    exec celery -A config beat \
      --loglevel "${CELERY_LOG_LEVEL:-INFO}" \
      --scheduler django_celery_beat.schedulers:DatabaseScheduler
    ;;
  *)
    echo "PROCESS_TYPE inconnu: ${PROCESS_TYPE}" >&2
    exit 64
    ;;
esac
