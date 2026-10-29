"""Cycle de vie complet d'une commande : non-régression de la relecture avant v1.0.0.

Stock rendu à l'annulation et à l'expiration, annulation impossible une fois
le colis remis au livreur, paiement tardif sur une commande annulée,
livraison menée jusqu'au bout, multi-boutiques (fonds libérés, remboursement
par sous-commande).
"""
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Inventory, Product
from apps.commissions import services
from apps.commissions.models import CommissionTransaction, SellerWallet
from apps.orders.expiry import expire_unpaid_orders
from apps.orders.models import Delivery, GlobalOrder, Order
from apps.orders.test_multistore import MultiStoreTestMixin
from apps.payments.models import Payment, Refund


@patch("apps.commissions.services.can_receive_orders", return_value=True)
@override_settings(PAYMENT_SANDBOX=True)
class OrderLifecycleTests(MultiStoreTestMixin, TestCase):
    # ----------------------------------------------------------- utilitaires

    def _single(self, quantity=3):
        self.client.force_authenticate(self.customer)
        response = self.client.post("/api/orders/checkout/", {
            "store": str(self.store_a.id), "address": str(self.address.id),
            "delivery_type": "standard", "payment_method": "wave",
            "items": [{"product_variant": str(self.variant_a.id), "quantity": quantity}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Order.objects.get(pk=response.data["id"])

    def _pay(self, payment):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            f"/api/payments/{payment.id}/sandbox-confirm/", {"outcome": "success"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def _age(self, order=None, global_order=None, hours=3):
        """Fait comme si la commande et sa dernière tentative de paiement dataient de `hours` heures."""
        past = timezone.now() - timedelta(hours=hours)
        if order is not None:
            Order.objects.filter(pk=order.pk).update(created_at=past)
            Payment.objects.filter(order=order).update(updated_at=past)
        if global_order is not None:
            GlobalOrder.objects.filter(pk=global_order.pk).update(created_at=past)
            Payment.objects.filter(global_order=global_order).update(updated_at=past)

    def _reserved(self, variant):
        return Inventory.objects.get(variant=variant).reserved_quantity

    def _driver_client(self):
        client = APIClient()
        client.force_authenticate(self.driver_user)
        return client

    # ----------------------------------------------------------- stock

    def test_cancel_releases_stock(self, _gate):
        order = self._single()
        self.assertEqual(self._reserved(self.variant_a), 3)
        response = self.client.post(f"/api/orders/{order.id}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._reserved(self.variant_a), 0)

    def test_unpaid_orders_expire_and_release_stock(self, _gate):
        order = self._single()
        self._age(order=order)
        self.assertEqual(expire_unpaid_orders(), 1)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(order.payment.status, Payment.Status.FAILED)
        self.assertEqual(self._reserved(self.variant_a), 0)

    def test_viewing_the_product_releases_stock_of_abandoned_orders(self, _gate):
        from django.core.cache import cache

        from apps.orders.expiry import EXPIRY_THROTTLE_KEY

        cache.delete(EXPIRY_THROTTLE_KEY)
        order = self._single()
        self._age(order=order)
        self.client.force_authenticate(None)
        response = self.client.get(f"/api/catalog/products/{self.variant_a.product_id}/")
        self.assertEqual(response.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(self._reserved(self.variant_a), 0)
        cache.delete(EXPIRY_THROTTLE_KEY)

    def test_recent_unpaid_order_is_kept(self, _gate):
        self._single()
        self.assertEqual(expire_unpaid_orders(), 0)
        self.assertEqual(self._reserved(self.variant_a), 3)

    def test_paid_order_never_expires(self, _gate):
        order = self._single()
        self._pay(order.payment)
        self._age(order=order, hours=48)
        self.assertEqual(expire_unpaid_orders(), 0)

    def test_expired_multistore_order_releases_every_store(self, _gate):
        response = self._perform_checkout()
        global_order = GlobalOrder.objects.get(pk=response.data["id"])
        self._age(global_order=global_order)
        self.assertEqual(expire_unpaid_orders(), 1)
        global_order.refresh_from_db()
        self.assertEqual(global_order.status, GlobalOrder.Status.CANCELLED)
        self.assertEqual(self._reserved(self.variant_a), 0)
        self.assertEqual(self._reserved(self.variant_b), 0)

    def test_stock_cannot_be_oversold(self, _gate):
        inventory = Inventory.objects.get(variant=self.variant_a)
        inventory.quantity = 2
        inventory.save()
        self.assertTrue(inventory.reserve(2))
        self.assertFalse(Inventory.objects.get(pk=inventory.pk).reserve(1))
        self.assertEqual(Inventory.objects.get(pk=inventory.pk).reserved_quantity, 2)

    def test_single_store_checkout_refuses_inactive_product_and_empty_cart(self, _gate):
        Product.objects.filter(pk=self.variant_a.product_id).update(status=Product.Status.DRAFT)
        self.client.force_authenticate(self.customer)
        response = self.client.post("/api/orders/checkout/", {
            "store": str(self.store_a.id), "address": str(self.address.id),
            "delivery_type": "standard", "payment_method": "wave",
            "items": [{"product_variant": str(self.variant_a.id), "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 400)
        empty = self.client.post("/api/orders/checkout/", {
            "store": str(self.store_a.id), "address": str(self.address.id),
            "delivery_type": "standard", "payment_method": "wave", "items": [],
        }, format="json")
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(Order.objects.count(), 0)

    # ----------------------------------------------------------- annulation

    def test_cannot_cancel_once_parcel_left_the_store(self, _gate):
        order = self._single()
        self._pay(order.payment)
        Delivery.objects.filter(order=order).update(status=Delivery.Status.IN_TRANSIT)
        response = self.client.post(f"/api/orders/{order.id}/cancel/")
        self.assertEqual(response.status_code, 400)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PAID)
        self.assertEqual(Refund.objects.count(), 0)

    def test_cancel_paid_order_before_pickup_refunds_and_stops_delivery(self, _gate):
        order = self._single()
        self._pay(order.payment)
        response = self.client.post(f"/api/orders/{order.id}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Refund.objects.get().amount, order.payment.amount)
        self.assertEqual(Delivery.objects.get(order=order).status, Delivery.Status.CANCELLED)

    # ----------------------------------------------------------- paiement

    def test_payment_after_cancellation_keeps_order_cancelled_and_opens_refund(self, _gate):
        order = self._single()
        self.client.post(f"/api/orders/{order.id}/cancel/")
        payment = Payment.objects.get(order=order)
        # Un paiement réel peut encore aboutir chez Wave après l'annulation.
        from apps.payments.views import _fulfill_payment
        _fulfill_payment(payment)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CANCELLED)
        self.assertEqual(Refund.objects.get(payment=payment).amount, payment.amount)
        self.assertFalse(CommissionTransaction.objects.filter(order=order).exists())

    def test_cancelled_order_cannot_be_paid_anymore(self, _gate):
        order = self._single()
        self.client.post(f"/api/orders/{order.id}/cancel/")
        response = self.client.post(f"/api/payments/{order.payment.id}/initiate/")
        self.assertEqual(response.status_code, 409)

    def test_replayed_success_does_not_regress_delivered_order(self, _gate):
        order = self._single()
        self._pay(order.payment)
        order.refresh_from_db()
        order.change_status(Order.Status.DELIVERED)
        self._pay(order.payment)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DELIVERED)

    # ----------------------------------------------------------- livraison

    def test_delivery_can_be_completed_after_out_for_delivery(self, _gate):
        order = self._single()
        self._pay(order.payment)
        delivery = Delivery.objects.get(order=order)
        delivery.driver = self.driver
        delivery.status = Delivery.Status.ASSIGNED
        delivery.save()
        driver = self._driver_client()
        code = driver.post(
            f"/api/orders/deliveries/{delivery.id}/status/", {"status": "picked_up"}, format="json"
        ).data["confirmation_code"]
        driver.post(f"/api/orders/deliveries/{delivery.id}/status/", {"status": "in_transit"}, format="json")
        driver.post(f"/api/orders/deliveries/{delivery.id}/status/", {"status": "out_for_delivery"}, format="json")
        regenerated = driver.post(f"/api/orders/deliveries/{delivery.id}/regenerate-otp/")
        self.assertEqual(regenerated.status_code, 200)
        code = regenerated.data["confirmation_code"]

        self.client.force_authenticate(self.customer)
        response = self.client.post(f"/api/orders/deliveries/{delivery.id}/confirm/", {"code": code}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.DELIVERED)

    def test_driver_can_report_failure(self, _gate):
        order = self._single()
        delivery = Delivery.objects.get(order=order)
        delivery.driver = self.driver
        delivery.status = Delivery.Status.IN_TRANSIT
        delivery.save()
        response = self._driver_client().post(
            f"/api/orders/deliveries/{delivery.id}/fail/", {"reason": "customer_absent"}, format="json"
        )
        self.assertIn(response.status_code, (200, 400))
        self.assertNotEqual(response.status_code, 500)
        bad = self._driver_client().post(
            f"/api/orders/deliveries/{delivery.id}/fail/", {"reason": "pas-un-motif"}, format="json"
        )
        self.assertEqual(bad.status_code, 400)

    # ----------------------------------------------------------- multi-boutiques

    def _paid_global_order(self):
        response = self._perform_checkout()
        self.assertEqual(response.status_code, 201, response.data)
        global_order = GlobalOrder.objects.get(pk=response.data["id"])
        self._pay(global_order.payments.first())
        global_order.refresh_from_db()
        return global_order

    def test_multistore_funds_are_released_after_delivery(self, _gate):
        global_order = self._paid_global_order()
        self.assertEqual(CommissionTransaction.objects.count(), 2)
        delivery = global_order.deliveries.first()
        delivery.status = Delivery.Status.DELIVERED
        delivery.delivered_at = timezone.now() - timedelta(days=30)
        delivery.save()
        self.assertEqual(services.release_pending_funds(at=timezone.now()), 2)

    def test_multistore_global_refund_reverses_every_seller(self, _gate):
        global_order = self._paid_global_order()
        response = self.client.post(f"/api/orders/global-orders/{global_order.id}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        refund = Refund.objects.get()
        refund.process()
        self.assertTrue(all(CommissionTransaction.objects.values_list("is_refunded", flat=True)))
        for wallet in SellerWallet.objects.all():
            self.assertEqual(wallet.pending_balance, Decimal("0"))
        self.assertEqual(self._reserved(self.variant_a), 0)
        self.assertEqual(self._reserved(self.variant_b), 0)

    def test_cancelling_one_store_refunds_only_its_share(self, _gate):
        global_order = self._paid_global_order()
        sub_order = global_order.orders.get(store=self.store_a)
        self.client.force_authenticate(self.merchant_a)
        response = self.client.post(f"/api/orders/{sub_order.id}/cancel/")
        self.assertEqual(response.status_code, 200, response.data)
        refund = Refund.objects.get()
        self.assertEqual(refund.order_id, sub_order.id)
        self.assertEqual(refund.amount, sub_order.total_amount)
        refund.process()
        payment = global_order.payments.first()
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCESS)  # remboursement partiel
        seller_a = CommissionTransaction.objects.get(order=sub_order)
        seller_b = CommissionTransaction.objects.get(order__store=self.store_b)
        self.assertTrue(seller_a.is_refunded)
        self.assertFalse(seller_b.is_refunded)
        global_order.refresh_from_db()
        self.assertNotEqual(global_order.status, GlobalOrder.Status.CANCELLED)

    def test_cancelling_last_store_cancels_purchase_and_refunds_delivery_fee(self, _gate):
        global_order = self._paid_global_order()
        for sub_order in global_order.orders.all():
            self.client.force_authenticate(sub_order.store.owner)
            self.assertEqual(self.client.post(f"/api/orders/{sub_order.id}/cancel/").status_code, 200)
        global_order.refresh_from_db()
        self.assertEqual(global_order.status, GlobalOrder.Status.CANCELLED)
        total = sum(Refund.objects.values_list("amount", flat=True))
        self.assertEqual(total, global_order.total_amount)

    def test_customer_sees_refunds_of_global_orders(self, _gate):
        global_order = self._paid_global_order()
        self.client.post(f"/api/orders/global-orders/{global_order.id}/cancel/")
        self.client.force_authenticate(self.customer)
        response = self.client.get("/api/payments/refunds/")
        self.assertEqual(response.data["count"], 1)

    def test_merchant_sees_own_multistore_purchases(self, _gate):
        self.address.user = self.merchant_b
        self.address.save(update_fields=["user"])
        self.client.force_authenticate(self.merchant_b)
        response = self.client.post("/api/orders/checkout/", self._checkout_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        listing = self.client.get(f"/api/orders/global-orders/{response.data['id']}/")
        self.assertEqual(listing.status_code, 200)

    # ----------------------------------------------------------- concurrence

    def test_second_cancel_neither_refunds_nor_releases_twice(self, _gate):
        other = self._single(quantity=5)  # réservation d'un autre client
        order = self._single(quantity=3)
        self._pay(order.payment)
        self.assertEqual(self.client.post(f"/api/orders/{order.id}/cancel/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/orders/{order.id}/cancel/").status_code, 400)
        self.assertEqual(Refund.objects.count(), 1)
        self.assertEqual(self._reserved(self.variant_a), 5)
        self.assertEqual(Order.objects.get(pk=other.pk).status, Order.Status.PENDING)

    def test_stale_instance_cannot_redo_a_transition(self, _gate):
        order = self._single(quantity=3)
        stale = Order.objects.get(pk=order.pk)
        self.assertTrue(order.change_status(Order.Status.CANCELLED))
        self.assertFalse(stale.change_status(Order.Status.CANCELLED))
        self.assertFalse(stale.change_status(Order.Status.PAID))
        self.assertEqual(self._reserved(self.variant_a), 0)
        self.assertEqual(Order.objects.get(pk=order.pk).status, Order.Status.CANCELLED)

    def test_recent_payment_attempt_postpones_expiry(self, _gate):
        order = self._single()
        Order.objects.filter(pk=order.pk).update(created_at=timezone.now() - timedelta(hours=3))
        self.client.post(f"/api/payments/{order.payment.id}/initiate/")
        self.assertEqual(expire_unpaid_orders(), 0)
        self.assertEqual(Order.objects.get(pk=order.pk).status, Order.Status.PENDING)

    def test_multistore_cannot_be_cancelled_once_tour_started(self, _gate):
        global_order = self._paid_global_order()
        global_order.deliveries.update(status=Delivery.Status.PICKUP_PENDING)
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.post(f"/api/orders/global-orders/{global_order.id}/cancel/").status_code, 400)
        sub_order = global_order.orders.get(store=self.store_a)
        self.client.force_authenticate(self.merchant_a)
        self.assertEqual(self.client.post(f"/api/orders/{sub_order.id}/cancel/").status_code, 400)
        self.assertEqual(Refund.objects.count(), 0)

    def test_late_orange_notification_on_expired_payment_is_recorded(self, _gate):
        order = self._single()
        payment = order.payment
        payment.method = "orange_money"
        payment.metadata = {"orange_money_attempts": [{"order_id": "SM-X-1", "pay_token": "p1", "notif_token": "old-nt"}],
                            "orange_money": {"order_id": "SM-X-2", "pay_token": "p2", "notif_token": "new-nt"}}
        payment.status = Payment.Status.FAILED
        payment.save()
        with override_settings(PAYMENT_SANDBOX=False, PAYMENT_PROVIDERS={"wave": "", "orange_money": ""}):
            response = APIClient().post(
                "/api/payments/webhook/orange_money/",
                data='{"status": "SUCCESS", "notif_token": "old-nt", "txnid": "MP9"}',
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 200, response.data)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.SUCCESS)
