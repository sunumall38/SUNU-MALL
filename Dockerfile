# Railway builds the repository root when the service is connected to GitHub.
# Keep the Django application in /app while preserving the monorepo layout.
FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements/ requirements/

ARG REQUIREMENTS_FILE=requirements/base.txt
RUN pip install --no-cache-dir --user -r "${REQUIREMENTS_FILE}"

FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY backend/ .
COPY railway-entrypoint.sh /app/railway-entrypoint.sh

RUN DJANGO_SETTINGS_MODULE=config.settings.dev python manage.py collectstatic --noinput \
    && chmod +x /app/railway-entrypoint.sh

EXPOSE 8000

CMD ["/app/railway-entrypoint.sh"]
