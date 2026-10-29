#!/bin/sh
# Démarrage du service web sur Render (dockerCommand de render.yaml).
#
# Render lance `dockerCommand` dans son propre shell : une commande composée
# écrite directement dans render.yaml (sh -c "…", &&, parenthèses) y arrive
# mal découpée. Tout passe donc par ce script, appelé en un seul mot.
set -eu

# 1. Schéma de base à jour : un échec ici arrête le déploiement (voulu).
python manage.py migrate --noinput

# 2. Étapes utiles mais jamais bloquantes pour servir le trafic.
python manage.py record_deployment || echo "record_deployment a échoué (ignoré)" >&2
python manage.py bootstrap_admin || echo "bootstrap_admin a échoué (ignoré)" >&2
python manage.py run_daily_tasks --if-due || echo "run_daily_tasks a échoué (ignoré)" >&2

# 3. Serveur web (gunicorn), qui remplace ce processus.
exec /app/entrypoint.sh
