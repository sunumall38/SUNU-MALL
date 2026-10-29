import json
import uuid
from django.conf import settings
from django.db import models, transaction
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Payment, Refund
from .serializers import PaymentSerializer, RefundSerializer
from .gateways import (
    FAILED, SUCCESS, PaymentGatewayError, available_methods, get_gateway,
    verify_orange_notification, verify_wave_signature, wave_session_outcome,
    NabooPayGateway, naboopay_transaction_outcome, record_naboopay_paid_order, verify_naboopay_signature,
)
from apps.monetization.models import Notification
from apps.orders.models import Order
from apps.security.utils import log_security_event
from apps.users.permissions import IsAdmin


def _is_uuid(value):
    """True si la référence peut être l'UUID d'un Payment (évite qu'une chaîne
    arbitraire dans un webhook ne fasse lever ValidationError sur le champ UUID)."""
    try:
        uuid.UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False


def _send_order_confirmation(order):
    """
    Confirmation envoyée au client juste après le paiement réussi. Email
    réellement délivré (SMTP déjà configuré) ; le canal SMS existe déjà
    dans le modèle Notification pour quand un fournisseur sera branché,
    mais n'envoie rien de réel pour l'instant (voir Notification._send_sms).
    """
    subject = f"Commande confirmée — {order.store.name}"
    message = (
        f"Bonjour {order.customer.first_name or order.customer.email},\n\n"
        f"Votre commande n°{str(order.id)[:8]} chez {order.store.name} a été payée avec succès.\n"
        f"Montant total : {order.total_amount} FCFA.\n\n"
        "Vous pouvez suivre sa livraison depuis votre espace Sunu Mall.\n\n"
        "Merci de votre confiance !"
    )
    notification = Notification.objects.create(
        user=order.customer,
        channel=Notification.Channel.EMAIL,
        subject=subject,
        message=message,
        metadata={"order_id": str(order.id)},
    )
    notification.send()


DELIVERY_TYPE_LABELS = {
    "standard": "Livraison standard",
    "express": "Livraison express",
    "pickup": "Retrait en boutique",
}


def _send_global_order_confirmation(global_order):
    """Confirmation client d'une commande multi-boutiques payée."""
    stores = ", ".join(sorted({o.store.name for o in global_order.orders.select_related("store")}))
    customer = global_order.customer
    notification = Notification.objects.create(
        user=customer,
        channel=Notification.Channel.EMAIL,
        subject="Commande confirmée — Sunu Mall",
        message=(
            f"Bonjour {customer.first_name or customer.email},\n\n"
            f"Votre commande n°{str(global_order.id)[:8]} ({stores}) a été payée avec succès.\n"
            f"Montant total : {global_order.total_amount} FCFA.\n\n"
            "Vos articles sont regroupés en une seule livraison, que vous pouvez suivre "
            "depuis votre espace Sunu Mall.\n\n"
            "Merci de votre confiance !"
        ),
        metadata={"global_order_id": str(global_order.id)},
    )
    notification.send()


def _notify_merchant_new_order(order):
    """Prévient le vendeur qu'une commande payée l'attend.

    Sans ce message, un vendeur ne découvre ses commandes qu'en ouvrant son
    tableau de bord. Contient ce qu'il faut préparer, jamais l'adresse du
    client (transmise au livreur dans l'application).
    """
    owner = order.store.owner
    lines = "\n".join(
        f"- {item.product_variant.product.name} × {item.quantity}"
        for item in order.items.select_related("product_variant__product")
    )
    delivery_label = DELIVERY_TYPE_LABELS.get(order.delivery_type or "standard", "Livraison")
    detail_url = f"{settings.FRONTEND_URL.rstrip('/')}/order-detail?order={order.id}"
    notification = Notification.objects.create(
        user=owner,
        channel=Notification.Channel.EMAIL,
        subject=f"Nouvelle commande payée — {order.store.name}",
        message=(
            f"Bonjour {owner.first_name or owner.email},\n\n"
            f"Une commande vient d'être payée dans votre boutique {order.store.name} "
            f"(n°{str(order.id)[:8]}).\n\n"
            f"Articles à préparer :\n{lines}\n\n"
            f"Montant des articles : {order.total_amount - order.delivery_fee} FCFA\n"
            f"Mode : {delivery_label}\n\n"
            f"Détail et suivi : {detail_url}\n\n"
            "L'équipe Sunu Mall"
        ),
        metadata={"kind": "merchant_new_order", "order_id": str(order.id)},
    )
    notification.send()


def _target_cancelled(payment):
    if payment.order_id is not None:
        return payment.order.status == Order.Status.CANCELLED
    if payment.global_order_id is not None:
        return payment.global_order.status == "cancelled"
    return False


def _fulfill_payment(payment, changed_by=None):
    """Traite un paiement confirmé réussi, quel que soit le canal (sandbox,
    webhook Wave, webhook Orange Money, vérification de statut).

    Idempotent et sûr en concurrence : le paiement est relu sous verrou, et
    seule la première confirmation déclenche le traitement (commande payée,
    email, affectation du livreur). Un webhook rejoué ou une vérification
    simultanée ne fait plus rien.

    Si la commande a été annulée avant l'arrivée du paiement (client parti,
    commande expirée), l'argent est bien encaissé mais la commande reste
    annulée et un remboursement est ouvert pour l'administration.
    """
    from apps.orders.models import GlobalOrder

    with transaction.atomic():
        # Ordre des verrous identique à l'annulation et à l'expiration :
        # commande (ou achat global) d'abord, paiement ensuite.
        if payment.global_order_id is not None:
            GlobalOrder.objects.select_for_update().get(pk=payment.global_order_id)
        elif payment.order_id is not None:
            Order.objects.select_for_update().get(pk=payment.order_id)
        locked = Payment.objects.select_for_update().get(pk=payment.pk)
        if locked.status == Payment.Status.SUCCESS:
            payment.refresh_from_db()
            return False
        locked.mark_succeeded()

        if _target_cancelled(locked):
            Refund.objects.get_or_create(
                payment=locked, order=None,
                defaults={
                    "amount": locked.amount,
                    "reason": "Paiement reçu après l'annulation de la commande",
                },
            )
            payment.refresh_from_db()
            return True

        if locked.order_id is not None:
            locked.order.change_status(Order.Status.PAID, changed_by=changed_by)
        elif locked.global_order_id is not None:
            # Sous-commandes annulées pendant que le paiement était en attente
            # (ex. boutique en rupture) : leur part est remboursée.
            for sub_order in locked.global_order.orders.filter(status=Order.Status.CANCELLED):
                Refund.objects.get_or_create(
                    payment=locked, order=sub_order,
                    defaults={"amount": sub_order.total_amount, "reason": "Sous-commande annulée avant paiement"},
                )
    payment.refresh_from_db()

    # Effets externes (emails, affectation du livreur) après validation.
    # Retrait en boutique : aucun livreur à affecter.
    if payment.order_id is not None:
        order = payment.order
        _send_order_confirmation(order)
        if order.status != Order.Status.CANCELLED:
            _notify_merchant_new_order(order)
        delivery = getattr(order, "delivery", None)
        if delivery and order.delivery_type != "pickup":
            delivery.auto_assign()
    elif payment.global_order_id is not None:
        global_order = payment.global_order
        _send_global_order_confirmation(global_order)
        for sub_order in global_order.orders.exclude(status=Order.Status.CANCELLED).select_related("store__owner"):
            _notify_merchant_new_order(sub_order)
        delivery = global_order.deliveries.first()
        if delivery and getattr(global_order, "delivery_type", "standard") != "pickup":
            delivery.auto_assign()
    # Le côté abonnement (activation + facture) est déjà géré par
    # Payment.mark_succeeded() lui-même — voir apps.payments.models.
    return True


def _apply_outcome(payment, outcome, changed_by=None):
    """Applique une issue SUCCESS/FAILED à un paiement encore modifiable."""
    if outcome == SUCCESS:
        _fulfill_payment(payment, changed_by=changed_by)
    elif outcome == FAILED and payment.status == Payment.Status.PENDING:
        payment.mark_failed()


class PaymentMethodsView(APIView):
    """GET /api/payments/methods/ — moyens de paiement proposés aux clients.

    Le frontend n'affiche que ces moyens : un moyen sans passerelle réelle
    configurée (ou la carte, sans passerelle du tout) n'est proposé qu'en
    mode sandbox.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"sandbox": bool(settings.PAYMENT_SANDBOX), "methods": available_methods()})


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lecture seule : un paiement n'est jamais modifié directement par
    l'utilisateur, seulement via les actions `initiate` / `sandbox-confirm`
    (ou plus tard un webhook fournisseur authentifié par signature).
    """
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin():
            return Payment.objects.all()
        return Payment.objects.filter(
            models.Q(order__customer=user)
            | models.Q(order__store__owner=user)
            | models.Q(global_order__customer=user)
            | models.Q(subscription__subscriber_id=user.id)
        ).distinct()

    def _ensure_customer(self, payment):
        if self.request.user.is_admin():
            return
        if payment.order_id is not None:
            owner_id = payment.order.customer_id
            message = "Seul le client de la commande peut agir sur ce paiement."
        elif payment.global_order_id is not None:
            owner_id = payment.global_order.customer_id
            message = "Seul le client de la commande peut agir sur ce paiement."
        else:
            owner_id = payment.subscription.subscriber_id
            message = "Seul l'abonné peut agir sur ce paiement."
        if owner_id != self.request.user.id:
            raise PermissionDenied(message)

    @action(detail=True, methods=["post"], url_path="initiate")
    def initiate(self, request, pk=None):
        """Démarre le paiement auprès du fournisseur (ou de la simulation sandbox)."""
        payment = self.get_object()
        self._ensure_customer(payment)
        if payment.status == Payment.Status.SUCCESS:
            return Response({"error": "Ce paiement est déjà réglé."}, status=status.HTTP_409_CONFLICT)
        if payment.status == Payment.Status.REFUNDED:
            return Response({"error": "Ce paiement a été remboursé."}, status=status.HTTP_409_CONFLICT)
        if _target_cancelled(payment):
            return Response(
                {"error": "Cette commande a été annulée : elle ne peut plus être payée."},
                status=status.HTTP_409_CONFLICT,
            )
        if payment.status == Payment.Status.FAILED:
            # Nouvelle tentative après un échec : le paiement redevient
            # payable (la commande, elle, n'a jamais quitté « en attente »).
            payment.status = Payment.Status.PENDING
            payment.save(update_fields=["status"])
        # Dernière tentative de paiement : l'expiration des commandes non
        # payées compte à partir d'ici, jamais pendant un paiement en cours.
        Payment.objects.filter(pk=payment.pk).update(updated_at=timezone.now())
        try:
            gateway = get_gateway(payment.method)
            result = gateway.initiate(payment)
        except PaymentGatewayError as exc:
            log_security_event(
                None, "payment.gateway.error", request,
                {"payment_id": str(payment.id), "method": payment.method, "error": str(exc)[:300]},
            )
            return Response(
                {"error": "Le service de paiement est indisponible pour le moment. Réessayez dans quelques minutes."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except NotImplementedError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_501_NOT_IMPLEMENTED)
        return Response(result)

    @action(detail=True, methods=["post"], url_path="refresh")
    def refresh(self, request, pk=None):
        """
        Vérifie le statut du paiement directement auprès du fournisseur.

        Appelé par la page de retour du client (et par l'administration) :
        si le webhook a été perdu ou tarde, le paiement est quand même
        confirmé. Le statut vient toujours du fournisseur, jamais du client.
        """
        payment = self.get_object()
        if payment.status == Payment.Status.PENDING and not settings.PAYMENT_SANDBOX and payment.provider_ref:
            try:
                outcome = get_gateway(payment.method).fetch_status(payment)
            except PaymentGatewayError as exc:
                log_security_event(
                    None, "payment.gateway.status_error", request,
                    {"payment_id": str(payment.id), "method": payment.method, "error": str(exc)[:300]},
                )
                outcome = None
            _apply_outcome(payment, outcome)
            payment.refresh_from_db()
        return Response(PaymentSerializer(payment).data)

    @action(detail=True, methods=["post"], url_path="sandbox-confirm")
    def sandbox_confirm(self, request, pk=None):
        """
        Simule la confirmation (succès ou échec) qu'enverrait normalement le
        fournisseur via webhook. Uniquement disponible quand PAYMENT_SANDBOX
        est actif — jamais en production avec de vraies clés configurées.
        """
        if not settings.PAYMENT_SANDBOX:
            return Response(
                {"error": "Le mode sandbox n'est pas actif sur cet environnement."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payment = self.get_object()
        self._ensure_customer(payment)

        outcome = request.data.get("outcome", "success")
        if outcome == "success":
            _fulfill_payment(payment, changed_by=request.user)
        else:
            payment.mark_failed()
        return Response(PaymentSerializer(payment).data)


class PaymentWebhookView(APIView):
    """
    Endpoint public de notification fournisseur, idempotent.

    POST /api/payments/webhook/{provider}/

    * ``provider="wave"`` : Wave Business envoie l'événement
      ``checkout.session.completed`` (la session dans ``data``), signé HMAC
      (entête ``Wave-Signature``). La signature est vérifiée avec
      ``WAVE_WEBHOOK_SECRET`` avant toute lecture du corps.
    * ``provider="orange_money"`` : Orange envoie
      ``{"status": "SUCCESS", "notif_token": ..., "txnid": ...}``. La seule
      authentification possible est la correspondance du ``notif_token`` avec
      celui reçu à la création du paiement (stocké dans Payment.metadata).

    * ``provider="naboopay"`` : NabooPay envoie l'événement ``payment_status``
      (``order_id``, ``transaction_status``, ``amount``…), signé HMAC-SHA256
      du corps brut (entête ``X-Signature``, secret ``NABOOPAY_WEBHOOK_SECRET``).

    En mode sandbox (``PAYMENT_SANDBOX`` actif), tous acceptent aussi le
    format générique ``{"reference", "status"}`` utilisé par SandboxGateway
    pour tester le cycle de vie complet.

    Sécurité : aucun paiement n'est confirmé sans que le backend retrouve le
    Payment à confirmer, et jamais sans signature/token valide hors sandbox.
    """

    permission_classes = [permissions.AllowAny]

    def _reject(self, request, reason, code=status.HTTP_403_FORBIDDEN):
        provider = self.kwargs.get("provider")
        log_security_event(
            None, "payment.webhook.rejected", request,
            {"provider": provider, "reason": reason},
        )
        return Response({"error": "Notification fournisseur non authentifiée."}, status=code)

    def _find_payment_by_ref(self, reference):
        if not reference:
            return None
        if _is_uuid(reference):
            return Payment.objects.filter(id=reference).first()
        return Payment.objects.filter(provider_ref=reference).first()

    def _handle_wave(self, data):
        """Événement Wave, signature déjà vérifiée. Retourne (payment, outcome)."""
        event = data.get("data", data) if isinstance(data, dict) else {}
        if isinstance(event, dict) and event.get("type"):
            # Enveloppe événement : {id, type, data}
            event = event.get("data") or {}
        if not isinstance(event, dict):
            return None, None
        event_type = data.get("type") if isinstance(data, dict) else None
        if event_type and event_type != "checkout.session.completed":
            # Autres événements Wave (tentative refusée, versements…) : la
            # session reste payable, rien à faire — accusé de réception pour
            # que Wave ne les renvoie pas en boucle.
            return None, "ignored"
        payment = self._find_payment_by_ref(event.get("client_reference"))
        if payment is None:
            payment = self._find_payment_by_ref(event.get("id"))
        if payment is None:
            return None, None
        try:
            outcome = wave_session_outcome(event, payment)
        except PaymentGatewayError:
            # Signature valide mais montant/devise différents : jamais de
            # validation d'un paiement pour un autre montant.
            return payment, "rejected"
        return payment, outcome

    def _handle_naboopay(self, payload):
        """Notification NabooPay, signature déjà vérifiée. Retourne (payment, outcome)."""
        if not isinstance(payload, dict):
            return None, None
        order_id = str(payload.get("order_id") or "").strip()
        if not order_id:
            return None, None
        payment = Payment.objects.filter(provider_ref=order_id).first()
        if payment is None:
            # Transaction d'une tentative précédente du même paiement (le
            # client a relancé le paiement puis réglé dans l'ancien onglet).
            payment = Payment.objects.filter(
                metadata__naboopay_attempts__contains=[{"order_id": order_id}]
            ).first()
        if payment is None:
            return None, None
        try:
            outcome = naboopay_transaction_outcome(payload, payment)
        except PaymentGatewayError:
            return payment, "rejected"
        if outcome == FAILED and order_id != payment.provider_ref:
            # Une ancienne tentative annulée n'invalide pas la tentative en cours.
            return payment, None
        if outcome == SUCCESS:
            record_naboopay_paid_order(payment, order_id)
        return payment, outcome

    def _handle_orange(self, payload):
        """Notification Orange Money, token vérifié. Retourne (payment, outcome)."""
        notif_token = payload.get("notif_token") if isinstance(payload, dict) else None
        status_value = str((payload or {}).get("status") or "").upper()

        # La notif_token est propre à chaque demande de paiement : c'est
        # notre référentiel de rapprochement (le corps d'une notification
        # Orange ne transporte que status/notif_token/txnid).
        payment = None
        if notif_token:
            payment = Payment.objects.filter(
                metadata__orange_money__notif_token=notif_token
            ).first()
        if payment is None and notif_token:
            # Notification d'une tentative précédente du même paiement (le
            # client a relancé le paiement puis réglé dans l'ancien onglet).
            # Recherche bornée aux paiements Orange encore en attente.
            from datetime import timedelta
            from django.utils import timezone

            # Un paiement passé « échoué » (expiration, tentative abandonnée)
            # peut encore être réglé dans un ancien onglet : il reste recherché.
            recent = Payment.objects.filter(
                method="orange_money", status__in=[Payment.Status.PENDING, Payment.Status.FAILED],
                created_at__gte=timezone.now() - timedelta(days=7),
            ).only("id", "metadata")
            for candidate in recent.iterator():
                attempts = (candidate.metadata or {}).get("orange_money_attempts") or []
                if any(a.get("notif_token") == notif_token for a in attempts):
                    payment = Payment.objects.get(pk=candidate.pk)
                    break
        if payment is None and (payload or {}).get("order_id"):
            payment = Payment.objects.filter(
                metadata__orange_money__order_id=payload["order_id"]
            ).first()
        if payment is None:
            payment = self._find_payment_by_ref((payload or {}).get("txnid"))
        if payment is None:
            return None, None
        if not verify_orange_notification(payment, notif_token):
            return payment, "rejected"
        if status_value == "SUCCESS":
            return payment, "success"
        if status_value in ("FAILED", "EXPIRED"):
            return payment, "failed"
        return payment, None

    def post(self, request, provider):
        raw_body = getattr(request, "body", b"")

        # --- Authentification fournisseur (hors sandbox) ---
        if not settings.PAYMENT_SANDBOX:
            if provider == "wave":
                secret = settings.PAYMENT_PROVIDERS.get("wave")
                signature_header = request.headers.get("Wave-Signature") or request.headers.get("X-Wave-Signature")
                if not secret or not signature_header or not verify_wave_signature(secret, signature_header, raw_body):
                    return self._reject(request, "signature_wave_invalide")
            elif provider == "naboopay":
                secret = settings.PAYMENT_PROVIDERS.get("naboopay")
                if not verify_naboopay_signature(secret, request.headers.get("X-Signature"), raw_body):
                    return self._reject(request, "signature_naboopay_invalide")
            elif provider not in ("wave", "orange_money"):
                return self._reject(request, "provider_not_configured", code=status.HTTP_503_SERVICE_UNAVAILABLE)
            # orange_money : l'authentification se fait paiement par paiement
            # via le notif_token (voir _handle_orange) — aucun secret global.

        try:
            payload = json.loads(raw_body or b"{}")
        except ValueError:
            return Response({"error": "Corps JSON invalide."}, status=status.HTTP_400_BAD_REQUEST)

        # --- Branchement par fournisseur (hors sandbox) ---
        if not settings.PAYMENT_SANDBOX:
            if provider == "wave":
                payment, outcome = self._handle_wave(payload)
            elif provider == "orange_money":
                payment, outcome = self._handle_orange(payload)
            elif provider == "naboopay":
                payment, outcome = self._handle_naboopay(payload)
            else:
                payment, outcome = None, None
            if payment is None and outcome == "ignored":
                return Response({"received": True, "status": "ignored"})
            if payment is None:
                log_security_event(
                    None, "payment.webhook.unknown_payment", request,
                    {"provider": provider, "reference": json.dumps(payload)[:160]},
                )
                return Response(
                    {"error": "Paiement introuvable pour cette notification."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if outcome == "rejected":
                return self._reject(request, {
                    "wave": "montant_wave_incoherent",
                    "naboopay": "montant_naboopay_incoherent",
                }.get(provider, "notif_token_invalide"))
            if outcome is None:
                return Response({"received": True, "status": "ignored"})
            already = payment.status
            _apply_outcome(payment, outcome)
            payment.refresh_from_db()
            if already == Payment.Status.SUCCESS:
                log_security_event(
                    None, "payment.webhook.deduplicated", request,
                    {"provider": provider, "payment_id": str(payment.id)},
                )
            return Response({
                "received": True,
                "payment_id": payment.id,
                "status": payment.status,
                "duplicate": already == Payment.Status.SUCCESS,
            })

        # --- Format générique sandbox (simulation du cycle de vie) ---
        reference = str(payload.get("reference", "")).strip()
        outcome = str(payload.get("status", "")).lower()
        if not reference or outcome not in ("success", "failed"):
            return Response(
                {"error": "reference et status ('success'|'failed') sont requis."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = self._find_payment_by_ref(reference)
        if payment is None:
            log_security_event(
                None, "payment.webhook.unknown_payment", request,
                {"provider": provider, "reference": reference[:80]},
            )
            return Response(
                {"error": "Paiement introuvable pour cette référence."},
                status=status.HTTP_404_NOT_FOUND,
            )

        already = payment.status
        if outcome == "success":
            _fulfill_payment(payment)
        else:
            payment.mark_failed()

        # Journaliser uniquement les événements anormaux (le double comptage
        # est impossible grâce à l'idempotence de mark_succeeded/mark_failed).
        if already == Payment.Status.SUCCESS:
            log_security_event(
                None, "payment.webhook.deduplicated", request,
                {"provider": provider, "reference": reference[:80], "payment_id": str(payment.id)},
            )

        return Response({
            "received": True,
            "payment_id": payment.id,
            "status": payment.status,
            "duplicate": already == payment.status,
        })


class RefundViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Remboursements créés automatiquement quand une commande déjà payée est
    annulée (voir OrderViewSet.cancel). Un client voit les siens ; seul
    l'admin peut les traiter (action `process`) — un remboursement Wave/
    Orange Money/carte n'est pas un appel API instantané ici, un humain
    confirme que l'argent a bien été renvoyé avant de le marquer complété.
    """
    serializer_class = RefundSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Refund.objects.select_related("payment__order__store", "payment__order__customer")
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        if user.is_admin():
            return qs
        return qs.filter(
            models.Q(payment__order__customer=user) | models.Q(payment__global_order__customer=user)
        )

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdmin])
    def process(self, request, pk=None):
        refund = self.get_object()
        if refund.status == Refund.Status.COMPLETED:
            return Response({"error": "Ce remboursement a déjà été traité."}, status=status.HTTP_400_BAD_REQUEST)
        payment = refund.payment
        # Wave (direct) et NabooPay remboursent par API, mais seulement la
        # totalité du paiement ; Orange Money Web Payment direct n'a pas
        # d'API de remboursement (refund() renvoie False). Un remboursement
        # partiel (une boutique d'une commande multi-boutiques), ou sans API,
        # se fait à la main depuis l'espace marchand, puis se valide ici.
        if (
            not settings.PAYMENT_SANDBOX and payment.method in ("wave", "orange_money")
            and payment.provider_ref and not refund.is_partial()
        ):
            gateway = get_gateway(payment.method)
            provider_label = "NabooPay" if isinstance(gateway, NabooPayGateway) else "Wave"
            try:
                gateway.refund(payment)
            except PaymentGatewayError as exc:
                log_security_event(
                    request.user, "payment.refund.gateway_error", request,
                    {"refund_id": refund.id, "error": str(exc)[:300]},
                )
                return Response(
                    {"error": f"{provider_label} n'a pas effectué le remboursement : {exc}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )
        refund.process()
        return Response(RefundSerializer(refund).data)

