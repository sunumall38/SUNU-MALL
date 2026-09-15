import logging

from django.conf import settings
from django.core.mail import send_mail


logger = logging.getLogger(__name__)


def notify_admin_store_created(store):
    """Prévenir l'équipe marketplace qu'une boutique attend sa validation."""
    recipient = settings.ADMIN_NOTIFICATION_EMAIL.strip()
    if not recipient:
        logger.warning(
            "Notification de création de boutique ignorée : "
            "ADMIN_NOTIFICATION_EMAIL n'est pas configuré."
        )
        return False

    owner = store.owner
    owner_name = owner.get_full_name().strip() or owner.username or owner.email
    review_url = f"{settings.FRONTEND_URL.rstrip('/')}/admin-shops"
    subject = f"[SUNU MALL] Nouvelle boutique à valider : {store.name}"
    message = (
        "Une nouvelle boutique vient d'être créée et attend votre validation.\n\n"
        f"Boutique : {store.name}\n"
        f"Propriétaire : {owner_name}\n"
        f"E-mail : {owner.email}\n"
        f"Téléphone : {store.phone or 'Non renseigné'}\n"
        f"Ville : {store.city or 'Non renseignée'}\n"
        f"Adresse : {store.address or 'Non renseignée'}\n"
        f"Statut : {store.get_status_display()}\n\n"
        f"Examiner la demande : {review_url}\n"
    )

    try:
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [recipient],
            fail_silently=False,
        )
    except Exception:
        logger.exception(
            "Échec de l'e-mail administrateur pour la boutique %s.",
            store.id,
        )
        return False

    return True
