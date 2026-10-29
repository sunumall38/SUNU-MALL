"""Annulation automatique des commandes jamais payées.

Une commande réserve son stock dès sa création. Sans échéance, un client qui
quitte la page de paiement (ou un acheteur malveillant) bloquait les articles
indéfiniment. Passé ORDER_PAYMENT_TIMEOUT_MINUTES sans paiement, la commande
est annulée et son stock rendu.

Appelé au début de chaque passage de commande (le stock libéré est
immédiatement disponible) et par `run_daily_tasks`. Si un paiement arrive
quand même plus tard, `_fulfill_payment` ouvre un remboursement.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

BATCH_SIZE = 200


def expire_unpaid_orders(now=None):
    """Annule les commandes en attente de paiement depuis trop longtemps. Retourne leur nombre."""
    from apps.payments.models import Payment

    from .models import GlobalOrder, Order

    now = now or timezone.now()
    cutoff = now - timedelta(minutes=settings.ORDER_PAYMENT_TIMEOUT_MINUTES)
    expired = 0

    # Le délai court depuis la dernière tentative de paiement (Payment.updated_at
    # est rafraîchi à chaque `initiate`) : une session Wave ouverte à 1 h 55
    # n'est jamais coupée à 2 h.
    singles = (
        Order.objects.filter(status=Order.Status.PENDING, global_order__isnull=True, created_at__lt=cutoff)
        .filter(Q(payment__isnull=True) | Q(payment__updated_at__lt=cutoff))
        .exclude(payment__status=Payment.Status.SUCCESS)
        .values_list("pk", flat=True)[:BATCH_SIZE]
    )
    for pk in list(singles):
        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=pk)
            payment = Payment.objects.select_for_update().filter(order=order).first()
            if order.status != Order.Status.PENDING or (payment and payment.status == Payment.Status.SUCCESS):
                continue
            if payment and payment.updated_at >= cutoff:
                continue
            order.change_status(Order.Status.CANCELLED, changed_by=order.customer)
            if payment and payment.status == Payment.Status.PENDING:
                Payment.objects.filter(pk=payment.pk).update(status=Payment.Status.FAILED)
            delivery = getattr(order, "delivery", None)
            if delivery is not None and delivery.status in Order.PRE_PICKUP_DELIVERY_STATUSES:
                delivery.cancel(comment="Commande non payée dans les délais")
            expired += 1

    globals_ = (
        GlobalOrder.objects.filter(status=GlobalOrder.Status.PENDING, created_at__lt=cutoff)
        .exclude(payments__status=Payment.Status.SUCCESS)
        .exclude(payments__updated_at__gte=cutoff)
        .values_list("pk", flat=True)[:BATCH_SIZE]
    )
    for pk in list(globals_):
        with transaction.atomic():
            # Achat global puis paiements, sous verrou (même ordre que la
            # confirmation de paiement) : un paiement qui aboutit pendant
            # l'expiration est soit vu ici, soit traité après elle.
            global_order = GlobalOrder.objects.select_for_update().get(pk=pk)
            payments = list(Payment.objects.select_for_update().filter(global_order=global_order))
            if global_order.status != GlobalOrder.Status.PENDING:
                continue
            if any(p.status == Payment.Status.SUCCESS or p.updated_at >= cutoff for p in payments):
                continue
            for order in global_order.orders.exclude(status=Order.Status.CANCELLED):
                order.change_status(Order.Status.CANCELLED, changed_by=global_order.customer)
            global_order.payments.filter(status=Payment.Status.PENDING).update(status=Payment.Status.FAILED)
            delivery = global_order.deliveries.first()
            if delivery is not None and delivery.status in Order.PRE_PICKUP_DELIVERY_STATUSES:
                delivery.cancel(comment="Commande non payée dans les délais")
            global_order.status = GlobalOrder.Status.CANCELLED
            global_order.save(update_fields=["status"])
            expired += 1
    return expired


EXPIRY_THROTTLE_KEY = "orders:expire-unpaid:last-run"
EXPIRY_THROTTLE_SECONDS = 5 * 60


def expire_unpaid_orders_if_due():
    """Variante bon marché appelée à la consultation d'un produit.

    Sans elle, un produit dont tout le stock est réservé par un panier
    abandonné restait « en rupture » jusqu'au passage quotidien : plus
    personne ne pouvant l'ajouter au panier, aucune commande ne déclenchait
    la libération. Au plus un passage toutes les 5 minutes par processus,
    et jamais d'erreur remontée à la lecture du catalogue.
    """
    import logging

    from django.core.cache import cache

    try:
        if not cache.add(EXPIRY_THROTTLE_KEY, 1, EXPIRY_THROTTLE_SECONDS):
            return 0
        return expire_unpaid_orders()
    except Exception:  # noqa: BLE001 — la lecture du catalogue ne doit jamais échouer pour ça
        logging.getLogger(__name__).exception("Expiration des commandes non payées impossible")
        return 0
