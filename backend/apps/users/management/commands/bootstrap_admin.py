"""Crée le premier administrateur au démarrage, sans console.

L'offre gratuite de Render n'a pas de Shell : impossible d'y lancer
`create_admin` à la main. Au démarrage, si ADMIN_BOOTSTRAP_EMAIL,
ADMIN_BOOTSTRAP_PHONE et ADMIN_BOOTSTRAP_PASSWORD sont renseignées et
qu'aucun compte n'existe encore avec cet email, le compte super-admin est
créé. Un compte existant n'est jamais modifié (le mot de passe changé après
la première connexion n'est pas écrasé au redémarrage suivant) et le mot de
passe n'est jamais écrit dans les journaux.

Une fois connecté, supprimez ADMIN_BOOTSTRAP_PASSWORD des variables Render.
"""
import io
import os

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Crée le super-administrateur décrit par ADMIN_BOOTSTRAP_* s'il n'existe pas encore."

    def handle(self, *args, **options):
        email = os.environ.get("ADMIN_BOOTSTRAP_EMAIL", "").strip().lower()
        phone = os.environ.get("ADMIN_BOOTSTRAP_PHONE", "").strip()
        password = os.environ.get("ADMIN_BOOTSTRAP_PASSWORD", "")
        if not (email and phone and password):
            self.stdout.write("Aucun administrateur initial à créer (ADMIN_BOOTSTRAP_* absentes).")
            return
        if get_user_model().objects.filter(email__iexact=email).exists():
            self.stdout.write(f"Administrateur {email} déjà présent : rien à faire.")
            return
        call_command(
            "create_admin", email=email, phone=phone, password=password, super_admin=True,
            stdout=io.StringIO(),
        )
        self.stdout.write(self.style.SUCCESS(f"Administrateur initial créé : {email}"))
