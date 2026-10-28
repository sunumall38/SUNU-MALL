"""Accès concurrents réels (PostgreSQL uniquement : SQLite ignore les verrous de ligne).

La CI utilise PostgreSQL : ces tests y tournent. En local sur SQLite ils sont ignorés.
"""
import threading
import time
from unittest import skipUnless
from unittest.mock import patch

from django.db import connection
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient

from apps.catalog.models import Inventory
from apps.commissions import services
from apps.orders.models import GlobalOrder, Order
from apps.orders.test_multistore import MultiStoreTestMixin
from apps.payments.models import Payment, Refund
from apps.payments.views import _fulfill_payment


@skipUnless(connection.vendor == "postgresql", "verrous de ligne : PostgreSQL requis")
@patch("apps.commissions.services.can_receive_orders", return_value=True)
@override_settings(PAYMENT_SANDBOX=True)
class ConcurrencyTests(MultiStoreTestMixin, TransactionTestCase):
    def _single(self, store, variant, quantity):
        client = APIClient()
        client.force_authenticate(self.customer)
        response = client.post("/api/orders/checkout/", {
            "store": str(store.id), "address": str(self.address.id),
            "delivery_type": "standard", "payment_method": "wave",
            "items": [{"product_variant": str(variant.id), "quantity": quantity}],
        }, format="json")
        assert response.status_code == 201, response.data
        return Order.objects.get(pk=response.data["id"])

    def test_simultaneous_cancels_refund_once(self, _gate):
        order = self._single(self.store_a, self.variant_a, 3)
        Inventory.objects.filter(variant=self.variant_a).update(reserved_quantity=8)  # +5 d'un autre client
        _fulfill_payment(order.payment)
        barrier = threading.Barrier(2, timeout=10)
        original = Order.can_be_cancelled

        def slow(instance):
            result = original(instance)
            try:
                barrier.wait()
            except threading.BrokenBarrierError:
                pass
            return result

        codes = []

        def cancel():
            try:
                client = APIClient()
                client.force_authenticate(self.customer)
                codes.append(client.post(f"/api/orders/{order.id}/cancel/").status_code)
            finally:
                connection.close()

        with patch.object(Order, "can_be_cancelled", slow):
            threads = [threading.Thread(target=cancel) for _ in range(2)]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join()
        self.assertEqual(sorted(codes), [200, 400])
        self.assertEqual(Refund.objects.count(), 1)
        self.assertEqual(Inventory.objects.get(variant=self.variant_a).reserved_quantity, 5)

    def test_concurrent_payments_do_not_deadlock_on_wallets(self, _gate):
        client = APIClient()
        client.force_authenticate(self.customer)
        response = client.post("/api/orders/checkout/", {
            "address": str(self.address.id), "delivery_type": "standard", "payment_method": "wave",
            "items": [{"product_variant": str(self.variant_a.id), "quantity": 1},
                      {"product_variant": str(self.variant_b.id), "quantity": 1}],
        }, format="json")
        assert response.status_code == 201, response.data
        global_payment = Payment.objects.get(global_order_id=response.data["id"])
        second_store = list(GlobalOrder.objects.get(pk=response.data["id"]).orders.all())[1].store
        variant = self.variant_a if second_store == self.store_a else self.variant_b
        single_payment = self._single(second_store, variant, 1).payment
        for merchant in (self.merchant_a, self.merchant_b):
            services.SellerWallet.get_or_create_for(merchant)
        services.PlatformWallet.singleton()

        original_platform = services._locked_platform

        def slow_platform():
            wallet = original_platform()
            time.sleep(0.5)  # élargit la fenêtre où l'interblocage se produisait
            return wallet

        errors = {}

        def pay(name, payment):
            try:
                _fulfill_payment(Payment.objects.get(pk=payment.pk))
            except Exception as exc:  # noqa: BLE001 — l'erreur est l'objet du test
                errors[name] = repr(exc)
            finally:
                connection.close()

        with patch.object(services, "_locked_platform", slow_platform):
            first = threading.Thread(target=pay, args=("global", global_payment))
            second = threading.Thread(target=pay, args=("single", single_payment))
            first.start()
            time.sleep(0.2)
            second.start()
            first.join()
            second.join()
        self.assertEqual(errors, {})
        self.assertEqual(
            Payment.objects.filter(pk__in=[global_payment.pk, single_payment.pk], status=Payment.Status.SUCCESS).count(), 2
        )
