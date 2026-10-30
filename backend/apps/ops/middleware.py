"""
Traitements quotidiens déclenchés par le trafic.

Sans worker ni tâche planifiée (Render), `run_daily_tasks --if-due` est lancé
au démarrage du service. Un service qui ne redémarre plus (offre payante,
sans mise en veille) ne les lancerait donc qu'aux déploiements : ce
middleware vérifie aussi, au plus une fois par intervalle, pendant le trafic.
La commande ne fait rien si la journée est déjà traitée et se verrouille en
base : plusieurs processus ne la lancent jamais deux fois.
"""
import logging
import threading
import time

from django.conf import settings
from django.core.management import call_command
from django.db import connections

logger = logging.getLogger(__name__)


def _run_daily_tasks():
    try:
        call_command("run_daily_tasks", if_due=True, verbosity=0)
    except Exception:  # noqa: BLE001 — ne jamais faire tomber le processus web
        logger.exception("Traitements quotidiens déclenchés par le trafic : échec")
    finally:
        # Ce fil a ouvert sa propre connexion : la rendre.
        connections.close_all()


class DailyTasksMiddleware:
    """Lance les traitements quotidiens en arrière-plan, sans ralentir la requête."""

    def __init__(self, get_response):
        self.get_response = get_response
        self._lock = threading.Lock()
        self._next_check = 0.0

    def __call__(self, request):
        if getattr(settings, "DAILY_TASKS_ON_REQUESTS", False):
            self._maybe_launch()
        return self.get_response(request)

    def _maybe_launch(self):
        now = time.monotonic()
        if now < self._next_check or not self._lock.acquire(blocking=False):
            return
        try:
            if now < self._next_check:
                return
            self._next_check = now + settings.DAILY_TASKS_CHECK_INTERVAL
            threading.Thread(target=_run_daily_tasks, name="daily-tasks", daemon=True).start()
        finally:
            self._lock.release()
