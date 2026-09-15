import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import DriverKYC, SellerKYC
from .storage import get_kyc_storage


logger = logging.getLogger(__name__)


def _delete_documents(instance):
    storage = get_kyc_storage()
    for stored_name in {instance.document_front, instance.document_back}:
        if not stored_name:
            continue
        try:
            storage.delete(stored_name)
        except Exception:  # noqa: BLE001 - la suppression du compte doit rester possible
            logger.exception("Impossible de supprimer la pièce KYC %s", stored_name)


@receiver(post_delete, sender=SellerKYC)
@receiver(post_delete, sender=DriverKYC)
def delete_kyc_documents(sender, instance, **kwargs):
    _delete_documents(instance)
