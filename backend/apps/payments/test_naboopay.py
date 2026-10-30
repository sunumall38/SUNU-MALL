"""Paiements Wave et Orange Money via l'agrégateur NabooPay (API v2).

Aucun appel réseau : `requests` est simulé. On vérifie la création de la
transaction (moyen choisi, montant exact, retour client), la confirmation
par webhook signé, le filet de sécurité au retour du client, et le
remboursement.
"""
import hashlib
import hmac
import json
from unittest import mock

from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.orders.models import Order
from apps.payments.gateways import (
    NabooPayGateway, available_methods, get_gateway, verify_naboopay_signature,
)
from apps.payments.models import Payment, Refund
from apps.payments.tests import FakeResponse, _order_payment
from config.settings.checks import validate_production_settings

NABOOPAY = dict(
    PAYMENT_SANDBOX=False,
    NABOOPAY_API_KEY="naboo_test_key",
    NABOOPAY_API_BASE_URL="https://api.naboopay.test",
    NABOOPAY_FEES_CUSTOMER_SIDE=False,
    PAYMENT_PROVIDERS={"wave": "", "orange_money": "", "naboopay": "naboo_whsec"},
    FRONTEND_URL="https://sunu-mall.pages.dev",
    WAVE_API_KEY="",
    ORANGE_MONEY_CLIENT_ID="",
    ORANGE_MONEY_CLIENT_SECRET="",
    ORANGE_MONEY_MERCHANT_KEY="",
)


def _transaction(order_id="ord_1", status_value="pending", amount=10000, **extra):
    data = {
        "order_id": order_id,
        "amount": amount,
        "currency": "XOF",
        "transaction_status": status_value,
        "checkout_url": f"https://checkout.naboopay.com/checkout/{order_id}",
    }
    data.update(extra)
    return data


def _sign(raw, secret="naboo_whsec"):
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


@override_settings(**NABOOPAY)
class NabooPayGatewayTests(TestCase):
    def setUp(self):
        self.customer, self.payment = _order_payment(method="wave")
        self.customer.first_name, self.customer.last_name = "Awa", "Diop"
        self.customer.phone = "+221771234567"
        self.customer.save(update_fields=["first_name", "last_name", "phone"])
        self.client = APIClient()
        self.client.force_authenticate(self.customer)

    def test_wave_and_orange_money_go_through_naboopay(self):
        self.assertIsInstance(get_gateway("wave"), NabooPayGateway)
        self.assertIsInstance(get_gateway("orange_money"), NabooPayGateway)
        self.assertEqual({m["id"] for m in available_methods()}, {"wave", "orange_money"})

    def test_initiate_creates_transaction_for_chosen_method(self):
        with mock.patch(
            "apps.payments.gateways.requests.post", return_value=FakeResponse(_transaction())
        ) as post:
            response = self.client.post(f"/api/payments/{self.payment.id}/initiate/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["checkout_url"], "https://checkout.naboopay.com/checkout/ord_1")
        url = post.call_args[0][0]
        payload = post.call_args[1]["json"]
        headers = post.call_args[1]["headers"]
        self.assertEqual(url, "https://api.naboopay.test/api/v2/transactions")
        self.assertEqual(headers["Authorization"], "Bearer naboo_test_key")
        self.assertEqual(payload["method_of_payment"], ["wave"])
        self.assertEqual(payload["products"][0]["price"], 10000)
        self.assertEqual(payload["products"][0]["quantity"], 1)
        self.assertFalse(payload["fees_customer_side"])
        self.assertEqual(
            payload["success_url"], f"https://sunu-mall.pages.dev/paiement/retour?payment={self.payment.id}"
        )
        self.assertTrue(payload["error_url"].endswith("&error=1"))
        self.assertEqual(payload["customer"], {"first_name": "Awa", "last_name": "Diop", "phone": "+221771234567"})
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.provider_ref, "ord_1")

    def test_initiate_reuses_pending_transaction(self):
        with mock.patch("apps.payments.gateways.requests.post", return_value=FakeResponse(_transaction())):
            self.client.post(f"/api/payments/{self.payment.id}/initiate/")
        with mock.patch(
            "apps.payments.gateways.requests.get", return_value=FakeResponse(_transaction())
        ), mock.patch("apps.payments.gateways.requests.post") as post:
            response = self.client.post(f"/api/payments/{self.payment.id}/initiate/")
        post.assert_not_called()
        self.assertEqual(response.data["checkout_url"], "https://checkout.naboopay.com/checkout/ord_1")

    def test_gateway_refusal_is_reported_cleanly(self):
        with mock.patch(
            "apps.payments.gateways.requests.post",
            return_value=FakeResponse({"error": "Invalid API key"}, status_code=401),
        ):
            response = self.client.post(f"/api/payments/{self.payment.id}/initiate/")
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PENDING)

    def test_refresh_confirms_paid_transaction(self):
        self.payment.provider_ref = "ord_1"
        self.payment.save(update_fields=["provider_ref"])
        paid = _transaction(status_value="paid", fees=250, selected_payment_method="wave")
        with mock.patch("apps.payments.gateways.requests.get", return_value=FakeResponse(paid)) as get:
            response = self.client.post(f"/api/payments/{self.payment.id}/refresh/")
        self.assertEqual(get.call_args[0][0], "https://api.naboopay.test/api/v2/transactions/ord_1")
        self.assertEqual(response.data["status"], Payment.Status.SUCCESS)
        self.payment.order.refresh_from_db()
        self.assertEqual(self.payment.order.status, Order.Status.PAID)

    def test_refresh_refuses_other_amount(self):
        self.payment.provider_ref = "ord_1"
        self.payment.save(update_fields=["provider_ref"])
        with mock.patch(
            "apps.payments.gateways.requests.get",
            return_value=FakeResponse(_transaction(status_value="paid", amount=100)),
        ):
            response = self.client.post(f"/api/payments/{self.payment.id}/refresh/")
        self.assertEqual(response.data["status"], Payment.Status.PENDING)

    def test_refresh_keeps_pending_and_marks_cancelled_failed(self):
        self.payment.provider_ref = "ord_1"
        self.payment.save(update_fields=["provider_ref"])
        with mock.patch("apps.payments.gateways.requests.get", return_value=FakeResponse(_transaction())):
            response = self.client.post(f"/api/payments/{self.payment.id}/refresh/")
        self.assertEqual(response.data["status"], Payment.Status.PENDING)
        with mock.patch(
            "apps.payments.gateways.requests.get",
            return_value=FakeResponse(_transaction(status_value="cancelled")),
        ):
            response = self.client.post(f"/api/payments/{self.payment.id}/refresh/")
        self.assertEqual(response.data["status"], Payment.Status.FAILED)


@override_settings(**NABOOPAY)
class NabooPayWebhookTests(TestCase):
    def setUp(self):
        self.customer, self.payment = _order_payment(method="orange_money")
        self.payment.provider_ref = "ord_2"
        self.payment.metadata = {
            "naboopay": {"order_id": "ord_2", "method": "orange_money"},
            "naboopay_attempts": [{"order_id": "ord_1"}, {"order_id": "ord_2"}],
        }
        self.payment.save(update_fields=["provider_ref", "metadata"])
        self.client = APIClient()

    def _post(self, body, signature=None):
        raw = json.dumps(body)
        return self.client.post(
            "/api/payments/webhook/naboopay/", data=raw, content_type="application/json",
            HTTP_X_SIGNATURE=signature if signature is not None else _sign(raw),
        )

    def test_signed_webhook_marks_order_paid(self):
        response = self._post(_transaction("ord_2", "paid", selected_payment_method="orange_money"))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCESS)
        self.assertEqual(self.payment.metadata["naboopay"]["paid_order_id"], "ord_2")
        self.payment.order.refresh_from_db()
        self.assertEqual(self.payment.order.status, Order.Status.PAID)

    def test_replayed_webhook_is_idempotent(self):
        body = _transaction("ord_2", "paid")
        self._post(body)
        response = self._post(body)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["duplicate"])

    def test_bad_or_missing_signature_is_rejected(self):
        body = _transaction("ord_2", "paid")
        self.assertEqual(self._post(body, signature="deadbeef").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self._post(body, signature="").status_code, status.HTTP_403_FORBIDDEN)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PENDING)

    def test_other_amount_is_rejected(self):
        response = self._post(_transaction("ord_2", "paid", amount=500))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PENDING)

    def test_payment_in_an_earlier_attempt_still_counts(self):
        response = self._post(_transaction("ord_1", "paid"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.SUCCESS)
        self.assertEqual(self.payment.metadata["naboopay"]["paid_order_id"], "ord_1")

    def test_cancelled_earlier_attempt_does_not_fail_current_one(self):
        self._post(_transaction("ord_1", "cancelled"))
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.status, Payment.Status.PENDING)

    def test_unknown_order_is_404(self):
        self.assertEqual(self._post(_transaction("ord_x", "paid")).status_code, status.HTTP_404_NOT_FOUND)

    def test_signature_helper(self):
        self.assertTrue(verify_naboopay_signature("s", _sign("{}", "s"), b"{}"))
        self.assertFalse(verify_naboopay_signature("", _sign("{}", "s"), b"{}"))
        self.assertFalse(verify_naboopay_signature("s", None, b"{}"))


@override_settings(**NABOOPAY)
class NabooPayRefundTests(TestCase):
    def test_admin_refund_calls_naboopay(self):
        from apps.users.models import Role, User, UserRole

        _, payment = _order_payment(method="wave")
        payment.provider_ref = "ord_9"
        payment.metadata = {"naboopay": {"order_id": "ord_9", "paid_order_id": "ord_9"}}
        payment.status = Payment.Status.SUCCESS
        payment.save(update_fields=["provider_ref", "metadata", "status"])
        refund = Refund.objects.create(payment=payment, amount=payment.amount, reason="Test")
        Role.objects.get_or_create(name=Role.RoleName.ADMIN)
        admin = User.objects.create_user(username="a@x.com", email="a@x.com", password="p", is_verified=True)
        UserRole.objects.create(user=admin, role=Role.objects.get(name=Role.RoleName.ADMIN))
        client = APIClient()
        client.force_authenticate(admin)
        with mock.patch(
            "apps.payments.gateways.requests.get", return_value=FakeResponse({"message": "ok"})
        ) as get:
            response = client.post(f"/api/payments/refunds/{refund.id}/process/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(get.call_args[0][0], "https://api.naboopay.test/api/v2/refund/ord_9")


class NabooPayProductionCheckTests(TestCase):
    def _settings(self, **overrides):
        base = {
            "PAYMENT_SANDBOX": False,
            "NABOOPAY_API_KEY": "key",
            "PAYMENT_PROVIDERS": {"naboopay": "secret"},
            "DATABASES": {"default": {"PASSWORD": "real"}},
        }
        base.update(overrides)
        return base

    def test_key_without_webhook_secret_is_refused(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_production_settings(self._settings(PAYMENT_PROVIDERS={"naboopay": ""}))

    def test_key_with_sandbox_is_refused(self):
        with self.assertRaises(ImproperlyConfigured):
            validate_production_settings(self._settings(PAYMENT_SANDBOX=True))

    def test_complete_configuration_passes(self):
        validate_production_settings(self._settings())
