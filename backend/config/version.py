"""Version de l'application (fichier VERSION à la racine du dépôt).

Source unique : le fichier `VERSION`, mis à jour par `scripts/release.sh`.
Dans l'image Docker il est copié à côté de `manage.py`. `APP_VERSION` dans
l'environnement a priorité (utile pour une image construite hors dépôt).
"""
import os
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def read_version() -> str:
    env = os.environ.get("APP_VERSION", "").strip()
    if env:
        return env
    for candidate in (_BACKEND_DIR / "VERSION", _BACKEND_DIR.parent / "VERSION"):
        try:
            value = candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if value:
            return value
    return "0.0.0-dev"


def read_commit() -> str:
    """Commit déployé : fourni par Render (RENDER_GIT_COMMIT) ou la CI (GIT_COMMIT)."""
    for name in ("RENDER_GIT_COMMIT", "GIT_COMMIT"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    return ""
