"""Envoi et validation des codes téléphone avec Twilio Verify."""

import logging

import requests
from django.conf import settings
from rest_framework.exceptions import APIException

logger = logging.getLogger(__name__)


class PhoneVerificationUnavailable(APIException):
    status_code = 503
    default_detail = "Le service SMS est temporairement indisponible. Réessayez plus tard."
    default_code = "phone_verification_unavailable"


def _twilio_auth():
    """Retourne l'identifiant et le secret HTTP sans jamais les journaliser."""
    api_key = settings.TWILIO_API_KEY_SID
    api_secret = settings.TWILIO_API_KEY_SECRET
    if api_key and api_secret:
        return api_key, api_secret

    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    if account_sid and auth_token:
        return account_sid, auth_token

    raise PhoneVerificationUnavailable()


def _verify_url(action):
    service_sid = settings.TWILIO_VERIFY_SERVICE_SID
    if not service_sid:
        raise PhoneVerificationUnavailable()
    return f"https://verify.twilio.com/v2/Services/{service_sid}/{action}"


def _post_twilio(action, data):
    try:
        response = requests.post(
            _verify_url(action),
            data=data,
            auth=_twilio_auth(),
            timeout=settings.TWILIO_HTTP_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        logger.exception("Twilio Verify est injoignable")
        raise PhoneVerificationUnavailable()
    return response


def start_phone_verification(phone):
    """Demande à Twilio Verify d'envoyer un code SMS au numéro E.164."""
    response = _post_twilio("Verifications", {"To": phone, "Channel": "sms"})
    if not response.ok:
        logger.warning("Twilio Verify a refusé l'envoi (HTTP %s)", response.status_code)
        raise PhoneVerificationUnavailable()

    try:
        payload = response.json()
    except ValueError:
        logger.warning("Réponse Twilio Verify illisible lors de l'envoi")
        raise PhoneVerificationUnavailable()

    if payload.get("status") != "pending":
        logger.warning("Statut Twilio Verify inattendu lors de l'envoi")
        raise PhoneVerificationUnavailable()


def check_phone_verification(phone, code):
    """Retourne True uniquement lorsque Twilio confirme le code comme approuvé."""
    response = _post_twilio("VerificationCheck", {"To": phone, "Code": code})
    if response.status_code in (400, 404):
        return False
    if not response.ok:
        logger.warning("Twilio Verify a refusé la vérification (HTTP %s)", response.status_code)
        raise PhoneVerificationUnavailable()

    try:
        return response.json().get("status") == "approved"
    except ValueError:
        logger.warning("Réponse Twilio Verify illisible lors de la vérification")
        raise PhoneVerificationUnavailable()
