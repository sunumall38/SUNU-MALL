"""
Utilitaires pour l'authentification : génération de tokens, envoi d'emails, etc.
"""
import hashlib
import logging
import secrets
from datetime import timedelta

from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.conf import settings
from django.utils import timezone
from apps.users.models import Token, User

logger = logging.getLogger(__name__)


class EmailVerificationTokenGenerator(PasswordResetTokenGenerator):
    """
    Générateur de tokens pour la vérification d'email (hérite de PasswordResetTokenGenerator).
    """
    def _make_hash_value(self, user, timestamp):
        return f"{user.pk}{timestamp}{user.is_verified}"


email_verification_token = EmailVerificationTokenGenerator()


def send_verification_email(user: User):
    """
    Envoie un email de vérification à l'utilisateur et indique si le
    fournisseur l'a accepté. Ne lève jamais : un
    échec d'envoi (SMTP injoignable, quota dépassé...) ne doit pas faire
    échouer une inscription déjà créée — le compte reste récupérable via
    l'endpoint `resend-verification`.
    """
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token.make_token(user)

    verification_url = f"{settings.FRONTEND_URL}/verify-email?uid={uid}&token={token}"

    subject = "Vérifiez votre email - SUNU MALL"
    message = render_to_string('emails/verification_email.txt', {
        'user': user,
        'verification_url': verification_url,
    })
    html_message = render_to_string('emails/verification_email.html', {
        'user': user,
        'verification_url': verification_url,
    })

    try:
        sent_count = send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            html_message=html_message,
            fail_silently=False,
        )
        logger.info("Email de vérification accepté par le fournisseur pour %s", user.email)
        return sent_count == 1
    except Exception:
        logger.exception("Échec de l'envoi de l'email de vérification pour %s", user.email)
        return False


def hash_guest_login_token(raw_token: str) -> str:
    """Empreinte stockée en base : le jeton lui-même n'existe que dans l'email."""
    return hashlib.sha256(raw_token.encode()).hexdigest()


def send_guest_login_link(user: User) -> bool:
    """
    Envoie à un client invité un lien de connexion à usage unique.

    Renvoie False sans rien envoyer si un lien a déjà été émis très récemment
    (GUEST_LOGIN_LINK_COOLDOWN_SECONDS) : la route appelante est publique, on
    ne doit pas pouvoir inonder une boîte mail. Ne lève jamais.
    """
    now = timezone.now()
    pending = Token.objects.filter(user=user, type=Token.TokenType.GUEST_LOGIN)
    cooldown = timedelta(seconds=settings.GUEST_LOGIN_LINK_COOLDOWN_SECONDS)
    if pending.filter(created_at__gt=now - cooldown).exists():
        return False

    # Un seul lien valide à la fois : les précédents sont révoqués.
    pending.filter(used_at__isnull=True).update(used_at=now)

    raw_token = secrets.token_urlsafe(32)
    Token.objects.create(
        user=user,
        type=Token.TokenType.GUEST_LOGIN,
        token=hash_guest_login_token(raw_token),
        expires_at=now + timedelta(minutes=settings.GUEST_LOGIN_LINK_TTL_MINUTES),
    )

    login_url = f"{settings.FRONTEND_URL}/guest-login?token={raw_token}"
    message = render_to_string("emails/guest_login_link.txt", {
        "user": user,
        "login_url": login_url,
        "ttl_minutes": settings.GUEST_LOGIN_LINK_TTL_MINUTES,
    })
    try:
        sent_count = send_mail(
            subject="Votre lien pour continuer votre commande - SUNU MALL",
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        return sent_count == 1
    except Exception:
        logger.exception("Échec de l'envoi du lien de connexion invité pour %s", user.email)
        return False
