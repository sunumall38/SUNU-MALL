"""L'essai gratuit commence désormais à la validation du dossier vendeur.

Les vendeurs pas encore validés, dont l'essai courait depuis la création du
compte, repartent « en attente » : leurs 30 jours démarreront à la validation.
"""
from django.db import migrations


def reset_pending_trials(apps, schema_editor):
    SellerSubscription = apps.get_model("commissions", "SellerSubscription")
    SellerKYC = apps.get_model("kyc", "SellerKYC")
    Store = apps.get_model("catalog", "Store")

    validated = set(SellerKYC.objects.filter(status="VERIFIED").values_list("seller_id", flat=True))
    validated |= set(Store.objects.filter(status="active").values_list("owner_id", flat=True))
    (
        SellerSubscription.objects.filter(status="trial", starts_at__isnull=True)
        .exclude(seller_id__in=validated)
        .update(trial_started_at=None, trial_ends_at=None)
    )


class Migration(migrations.Migration):
    dependencies = [
        ("commissions", "0002_admin_center_plan_renames"),
        ("kyc", "0002_sellerkyc_address_sellerkyc_document_hash_and_more"),
        ("catalog", "0010_seed_product_categories"),
    ]

    operations = [
        migrations.RunPython(reset_pending_trials, migrations.RunPython.noop),
    ]
