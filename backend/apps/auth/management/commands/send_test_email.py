from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError


class Command(BaseCommand):
    help = "Envoie un email transactionnel de test via le fournisseur configuré."

    def add_arguments(self, parser):
        parser.add_argument("recipient", help="Adresse qui recevra le message de test")

    def handle(self, *args, **options):
        recipient = options["recipient"].strip()
        try:
            validate_email(recipient)
        except ValidationError as exc:
            raise CommandError("Adresse email invalide.") from exc

        try:
            sent_count = send_mail(
                subject="Test du service email SUNU MALL",
                message=(
                    "Le service email transactionnel de SUNU MALL est correctement "
                    "configuré et joignable depuis Railway."
                ),
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient],
                fail_silently=False,
            )
        except Exception as exc:
            raise CommandError(f"Échec de l'envoi : {type(exc).__name__}: {exc}") from exc

        if sent_count != 1:
            raise CommandError(f"Le fournisseur a retourné un compteur inattendu : {sent_count}")

        self.stdout.write(self.style.SUCCESS(f"Email de test accepté pour {recipient}."))
