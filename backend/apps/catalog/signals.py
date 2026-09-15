import logging

from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Category, ProductImage, Store


logger = logging.getLogger(__name__)


def _delete_file(field_file):
    if not field_file or not field_file.name:
        return
    try:
        field_file.storage.delete(field_file.name)
    except Exception:  # noqa: BLE001 - un fichier absent ne doit pas bloquer la suppression métier
        logger.exception("Impossible de supprimer le fichier de catalogue %s", field_file.name)


@receiver(post_delete, sender=Store)
def delete_store_files(sender, instance, **kwargs):
    _delete_file(instance.logo)
    _delete_file(instance.banner)


@receiver(post_delete, sender=ProductImage)
def delete_product_image_file(sender, instance, **kwargs):
    _delete_file(instance.image)


@receiver(post_delete, sender=Category)
def delete_category_image_file(sender, instance, **kwargs):
    _delete_file(instance.image)
