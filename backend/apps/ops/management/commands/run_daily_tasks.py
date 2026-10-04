"""
Exécute les traitements quotidiens de la plateforme, sans worker ni Celery Beat.

    python manage.py run_daily_tasks            # exécute toujours
    python manage.py run_daily_tasks --if-due   # au plus une fois par jour

Sur un hébergement sans processus d'arrière-plan (offre gratuite de Render,
par exemple), la commande est lancée à chaque démarrage du service avec
`--if-due` : les traitements passent une fois par jour, au premier démarrage
de la journée. Là où Celery Beat tourne, elle n'est pas nécessaire.

Les deux traitements sont ceux de CELERY_BEAT_SCHEDULE et sont idempotents :
    - expiration des abonnements échus et rappels « expire bientôt » ;
    - libération des fonds vendeurs dont le délai est écoulé.
"""
import logging

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.commissions.tasks import release_pending_funds_task
from apps.monetization.tasks import expire_and_remind_subscriptions
from apps.ops.models import SystemSetting

logger = logging.getLogger(__name__)

LAST_RUN_KEY = "ops.daily_tasks.last_run"

DAILY_TASKS = [
    ("expire_and_remind_subscriptions", expire_and_remind_subscriptions),
    ("release_pending_funds", release_pending_funds_task),
]


class Command(BaseCommand):
    help = "Exécute les traitements quotidiens (abonnements, fonds vendeurs)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--if-due", action="store_true",
            help="Ne rien faire si les traitements ont déjà réussi aujourd'hui.",
        )

    def handle(self, *args, **options):
        today = timezone.localdate().isoformat()
        SystemSetting.objects.get_or_create(
            key=LAST_RUN_KEY,
            defaults={
                "label": "Dernière exécution des traitements quotidiens",
                "value_type": SystemSetting.ValueType.STRING,
            },
        )

        # Le verrou de ligne sérialise deux démarrages simultanés : le second
        # attend la fin du premier, puis constate que la journée est faite.
        with transaction.atomic():
            marker = SystemSetting.objects.select_for_update().get(key=LAST_RUN_KEY)
            if options["if_due"] and marker.value == today:
                self.stdout.write(f"Traitements quotidiens déjà exécutés le {today} : rien à faire.")
                return

            failures = []
            for name, task in DAILY_TASKS:
                try:
                    # Savepoint par traitement : un échec n'annule pas l'autre.
                    with transaction.atomic():
                        result = task()
                    self.stdout.write(f"{name} : terminé ({result!r}).")
                except Exception:  # noqa: BLE001 — on veut le compte rendu complet
                    logger.exception("Traitement quotidien en échec : %s", name)
                    failures.append(name)

            # En cas d'échec la date n'est pas enregistrée : le prochain
            # démarrage réessaie.
            if not failures:
                marker.set_value(today)

        if failures:
            raise CommandError("Traitements quotidiens en échec : " + ", ".join(failures))
        self.stdout.write(self.style.SUCCESS(f"Traitements quotidiens exécutés le {today}."))
