"""Backends d'e-mail accessibles depuis les hébergements sans SMTP sortant."""

import base64
import logging

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


logger = logging.getLogger(__name__)


class GmailApiError(RuntimeError):
    """Erreur explicite et sans secret lors d'un appel à l'API Gmail."""


class GmailApiEmailBackend(BaseEmailBackend):
    """
    Envoie les ``EmailMessage`` Django avec l'API Gmail HTTPS.

    Le refresh token représente le compte Google expéditeur. Un access token
    court est obtenu une fois par lot, puis chaque message MIME est envoyé par
    ``users.messages.send``. Aucun port SMTP n'est utilisé.
    """

    def _access_token(self):
        try:
            response = requests.post(
                settings.GMAIL_TOKEN_URL,
                data={
                    "client_id": settings.GMAIL_CLIENT_ID,
                    "client_secret": settings.GMAIL_CLIENT_SECRET,
                    "refresh_token": settings.GMAIL_REFRESH_TOKEN,
                    "grant_type": "refresh_token",
                },
                timeout=settings.EMAIL_TIMEOUT,
            )
            response.raise_for_status()
            access_token = response.json().get("access_token")
        except (requests.RequestException, ValueError) as exc:
            raise GmailApiError("Impossible d'obtenir un jeton d'accès Gmail.") from exc

        if not access_token:
            raise GmailApiError("Google n'a pas renvoyé de jeton d'accès Gmail.")
        return access_token

    def _send_message(self, email_message, access_token):
        mime_message = email_message.message()
        encoded_message = base64.urlsafe_b64encode(mime_message.as_bytes()).decode("ascii")

        try:
            response = requests.post(
                settings.GMAIL_SEND_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json",
                },
                json={"raw": encoded_message},
                timeout=settings.EMAIL_TIMEOUT,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            raise GmailApiError("L'API Gmail a refusé l'envoi du message.") from exc

    def send_messages(self, email_messages):
        deliverable = [message for message in email_messages if message.recipients()]
        if not deliverable:
            return 0

        sent_count = 0
        try:
            access_token = self._access_token()
            for email_message in deliverable:
                self._send_message(email_message, access_token)
                sent_count += 1
        except GmailApiError:
            if not self.fail_silently:
                raise
            logger.exception("Échec d'envoi via l'API Gmail")

        return sent_count
