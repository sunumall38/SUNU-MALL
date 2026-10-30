"""Actions de la boutique sur ses commandes : confirmer, colis prêt.

La commande payée passe « en préparation », le client est prévenu ; « colis
prêt » date la préparation, marque le point de collecte d'un achat
multi-boutiques et prévient le livreur déjà affecté. L'annulation reste
possible tant que le colis n'a pas quitté la boutique.
"""
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.monetization.models import Notification
from apps.orders.models import DeliveryPickup, GlobalOrder, Order
from apps.orders.test_multistore import MultiStoreTestMixin


@patch("apps.commissions.services.can_receive_orders", return_value=True)
@override_settings(PAYMENT_SANDBOX=True)
class MerchantOrderActionsTests(MultiStoreTestMixin, TestCase):
    def _single(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post("/api/orders/checkout/", {
            "store": str(self.store_a.id), "address": str(self.address.id),
            "delivery_type": "standard", "payment_method": "wave",
            "items": [{"product_variant": str(self.variant_a.id), "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Order.objects.get(pk=response.data["id"])

    def _pay(self, payment):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/payments/{payment.id}/sandbox-confirm/", {"outcome": "success"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def _as_merchant(self, action, order, merchant=None):
        self.client.force_authenticate(merchant or self.merchant_a)
        return self.client.post(f"/api/orders/{order.id}/{action}/")

    def _confirmations(self):
        return Notification.objects.filter(user=self.customer, subject__startswith="Commande en préparation")

    def test_confirm_moves_paid_order_to_processing_once(self, _gate):
        order = self._single()
        self._pay(order.payment)

        response = self._as_merchant("confirm", order)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], Order.Status.PROCESSING)
        self.assertEqual(self._confirmations().count(), 1)

        again = self._as_merchant("confirm", order)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(self._confirmations().count(), 1)

    def test_unpaid_order_cannot_be_confirmed_or_ready(self, _gate):
        order = self._single()
        for action in ("confirm", "ready"):
            response = self._as_merchant(action, order)
            self.assertEqual(response.status_code, 400, response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PENDING)
        self.assertIsNone(order.ready_at)

    def test_customer_cannot_confirm_their_own_order(self, _gate):
        order = self._single()
        self._pay(order.payment)
        self.client.force_authenticate(self.customer)
        response = self.client.post(f"/api/orders/{order.id}/confirm/")
        self.assertEqual(response.status_code, 403)

    def test_ready_confirms_and_dates_the_parcel(self, _gate):
        order = self._single()
        self._pay(order.payment)

        response = self._as_merchant("ready", order)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], Order.Status.PROCESSING)
        self.assertIsNotNone(response.data["ready_at"])
        self.assertEqual(self._confirmations().count(), 1)

    def test_ready_notifies_the_assigned_driver(self, _gate):
        order = self._single()
        self._pay(order.payment)
        delivery = order.current_delivery()
        delivery.driver = self.driver
        delivery.save(update_fields=["driver"])

        self._as_merchant("ready", order)
        self.assertTrue(
            Notification.objects.filter(user=self.driver_user, subject__startswith="Colis prêt").exists()
        )

    def test_ready_marks_only_this_store_pickup_in_a_multistore_order(self, _gate):
        response = self._perform_checkout()
        global_order = GlobalOrder.objects.get(pk=response.data["id"])
        self._pay(global_order.payments.first())
        order_a = Order.objects.get(global_order=global_order, store=self.store_a)

        response = self._as_merchant("ready", order_a)
        self.assertEqual(response.status_code, 200, response.data)
        pickups = {p.store_id: p.pickup_status for p in DeliveryPickup.objects.filter(delivery__global_order=global_order)}
        self.assertEqual(pickups[self.store_a.id], DeliveryPickup.Status.READY)
        self.assertEqual(pickups[self.store_b.id], DeliveryPickup.Status.PENDING)

    def test_processing_order_can_still_be_cancelled_before_pickup(self, _gate):
        order = self._single()
        self._pay(order.payment)
        self._as_merchant("confirm", order)

        self.client.force_authenticate(self.customer)
        response = self.client.post(f"/api/orders/{order.id}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["status"], Order.Status.CANCELLED)
