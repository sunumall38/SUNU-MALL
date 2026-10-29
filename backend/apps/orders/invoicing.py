"""
Facturation mensuelle des partenaires de livraison.

Sunu Mall encaisse tous les paiements clients (Wave, Orange Money, carte) et
reverse à chaque partenaire, une fois par mois, le coût fixe de sa zone pour
chaque course livrée (`Delivery.partner_cost`, figé à l'attribution).

`generate_partner_invoices` est idempotente : une course n'est facturée
qu'une fois (`Delivery.invoice`). Elle tourne chaque jour avec les
traitements quotidiens et ne produit quelque chose qu'en début de mois, ou
pour rattraper une course livrée tard.
"""
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.monetization.models import Notification

from .models import Delivery, DeliveryPartner, PartnerInvoice


def previous_month(today):
    """(premier jour, dernier jour) du mois précédant `today`."""
    period_end = today.replace(day=1) - timedelta(days=1)
    return period_end.replace(day=1), period_end


def _invoiceable(partner, period_end):
    """Courses livrées jusqu'à la fin de période et pas encore facturées."""
    return (
        Delivery.objects
        .select_for_update()
        .filter(
            partner=partner,
            status=Delivery.Status.DELIVERED,
            invoice__isnull=True,
            delivered_at__date__lte=period_end,
        )
        .order_by("delivered_at")
    )


def _notify(invoice):
    user = invoice.partner.user
    if user is None:
        return
    Notification.objects.create(
        user=user,
        channel=Notification.Channel.EMAIL,
        subject=f"Facture {invoice.reference} — {invoice.balance} FCFA",
        message=(
            "Bonjour,\n\n"
            f"Votre facture {invoice.reference} du {invoice.period_start:%d/%m/%Y} au "
            f"{invoice.period_end:%d/%m/%Y} est disponible : "
            f"{invoice.marketplace_deliveries_count} livraison(s), {invoice.balance} FCFA.\n"
            f"Échéance de paiement : {invoice.due_date:%d/%m/%Y}.\n\n"
            f"Détail : {settings.FRONTEND_URL}/partner-finances\n\n"
            "Cordialement,\nL'équipe Sunu Mall"
        ),
        metadata={"kind": "partner_invoice", "invoice": invoice.reference},
    ).send()


def create_invoice_for_partner(partner, period_start, period_end, today=None):
    """Facture les courses non facturées du partenaire jusqu'à `period_end`.

    Renvoie la facture créée, ou None s'il n'y a rien à facturer.
    """
    today = today or timezone.localdate()
    with transaction.atomic():
        deliveries = list(_invoiceable(partner, period_end))
        if not deliveries:
            return None
        total = Decimal("0")
        for delivery in deliveries:
            # Courses attribuées avant le gel du coût : on le fige maintenant.
            if not delivery.partner_cost:
                delivery.partner_cost = partner.partner_cost_for(delivery)
            total += delivery.partner_cost
        invoice = PartnerInvoice.objects.create(
            partner=partner,
            status=PartnerInvoice.Status.PENDING,
            period_start=period_start,
            period_end=period_end,
            due_date=today + timedelta(days=settings.PARTNER_INVOICE_PAYMENT_DAYS),
            marketplace_rate=Decimal("0"),
            on_demand_rate=Decimal("0"),
            marketplace_deliveries_count=len(deliveries),
            marketplace_amount=total,
            collection_fees=Decimal("0"),
            total_due=total,
            recon_amount=total,
        )
        for delivery in deliveries:
            delivery.invoice = invoice
        Delivery.objects.bulk_update(deliveries, ["invoice", "partner_cost"])
        # Envoi après validation : appelée depuis run_daily_tasks (transaction
        # englobante), une facture annulée par un échec plus loin ne doit pas
        # avoir déjà été envoyée au partenaire.
        transaction.on_commit(lambda: _notify(invoice))
    return invoice


def generate_partner_invoices(today=None):
    """Émet la facture du mois écoulé pour chaque partenaire concerné."""
    today = today or timezone.localdate()
    period_start, period_end = previous_month(today)
    created = []
    partner_ids = (
        Delivery.objects
        .filter(status=Delivery.Status.DELIVERED, invoice__isnull=True, partner__isnull=False,
                delivered_at__date__lte=period_end)
        .values_list("partner_id", flat=True)
        .distinct()
    )
    for partner in DeliveryPartner.objects.filter(id__in=list(partner_ids)):
        invoice = create_invoice_for_partner(partner, period_start, period_end, today=today)
        if invoice is not None:
            created.append(invoice.reference)
    return created
