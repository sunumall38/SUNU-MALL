"""Enregistre la version qui démarre dans l'historique des déploiements.

Lancé au démarrage du service (render.yaml) : la page « Déploiements » de
l'administration montre ainsi quelle version tourne et depuis quand, sans
saisie manuelle. Idempotent : un redémarrage de la même version (même
commit) ne crée pas de doublon.
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.ops.models import DeploymentVersion


class Command(BaseCommand):
    help = "Enregistre la version courante (fichier VERSION + commit) comme version active."

    def add_arguments(self, parser):
        parser.add_argument("--environment", default="production")

    def handle(self, *args, **options):
        version = settings.APP_VERSION
        commit = settings.APP_COMMIT[:64]
        environment = options["environment"]
        with transaction.atomic():
            current = (
                DeploymentVersion.objects.filter(version=version, commit_sha=commit, environment=environment)
                .order_by("-deployed_at")
                .first()
            )
            if current is None:
                current = DeploymentVersion.objects.create(
                    version=version, commit_sha=commit, environment=environment,
                    status=DeploymentVersion.Status.ACTIVE, is_active=True,
                    notes="Enregistré automatiquement au démarrage.",
                )
            DeploymentVersion.objects.filter(environment=environment, is_active=True).exclude(pk=current.pk).update(
                is_active=False, status=DeploymentVersion.Status.DEPLOYED,
            )
            if not current.is_active:
                current.is_active = True
                current.status = DeploymentVersion.Status.ACTIVE
                current.save(update_fields=["is_active", "status"])
        self.stdout.write(f"Version active : {version} ({commit[:12] or 'commit inconnu'})")
