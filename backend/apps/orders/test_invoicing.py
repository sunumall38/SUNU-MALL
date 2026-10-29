"""Facturation mensuelle des partenaires (coût fixe par zone, sans commission)."""
from datetime import date, datetime, time
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import Store
from apps.monetization.models import Notification
from apps.orders.invoicing import generate_partner_invoices, previous_month
from apps.orders.models import (
    Address, Delivery, DeliveryPartner, Order, PartnerInvoice, PartnerZonePricing,
)
from apps.orders.tests import _dakar_zone
from apps.users.models import Role, User, UserRole

TODAY = date(2026, 11, 2)


def _at(day):
    return timezone.make_aware(datetime.combine(day, time(12, 0)))


class PartnerInvoicingTests(TestCase):
    def setUp(self):
        for role_name in (Role.RoleName.PARTNER, Role.RoleName.CLIENT, Role.RoleName.MERCHANT, Role.RoleName.ADMIN):
            Role.objects.get_or_create(name=role_name)
        self.zone = _dakar_zone()
        self.admin = User.objects.create_user(username="admin@ex.com", email="admin@ex.com", password="x")
        UserRole.objects.create(user=self.admin, role=Role.objects.get(name=Role.RoleName.ADMIN))
        self.partner_user = User.objects.create_user(username="p@ex.com", email="p@ex.com", password="x")
        UserRole.objects.create(user=self.partner_user, role=Role.objects.get(name=Role.RoleName.PARTNER))
        self.partner = DeliveryPartner.objects.create(
            name="CityCourier", status=DeliveryPartner.Status.ACTIVE, user=self.partner_user,
        )
        PartnerZonePricing.objects.create(
            partner=self.partner, zone=self.zone, client_fee=Decimal("1200"), partner_cost=Decimal("800"),
        )
        self.other_partner = DeliveryPartner.objects.create(name="Other", status=DeliveryPartner.Status.ACTIVE)
        merchant = User.objects.create_user(username="m@ex.com", email="m@ex.com", password="x")
        self.store = Store.objects.create(owner=merchant, name="Boutique")
        self.customer = User.objects.create_user(username="c@ex.com", email="c@ex.com", password="x")
        self.address = Address.objects.create(
            user=self.customer, label="Maison", latitude=Decimal("14.715000"), longitude=Decimal("-17.465000"),
        )

    def _delivery(self, delivered_on=None, partner=None, cost=Decimal("800"), status_=Delivery.Status.DELIVERED):
        order = Order.objects.create(customer=self.customer, store=self.store, address=self.address, total_amount=5000)
        return Delivery.objects.create(
            order=order, partner=partner or self.partner, partner_cost=cost, status=status_,
            delivered_at=_at(delivered_on) if delivered_on else None,
        )

    def test_previous_month_bounds(self):
        self.assertEqual(previous_month(TODAY), (date(2026, 10, 1), date(2026, 10, 31)))
        self.assertEqual(previous_month(date(2026, 1, 15)), (date(2025, 12, 1), date(2025, 12, 31)))

    def test_invoice_sums_frozen_partner_costs_of_last_month(self):
        d1 = self._delivery(date(2026, 10, 3))
        d2 = self._delivery(date(2026, 10, 31), cost=Decimal("1500"))
        current_month = self._delivery(date(2026, 11, 1))
        in_progress = self._delivery(None, status_=Delivery.Status.IN_TRANSIT)
        self._delivery(date(2026, 10, 10), partner=self.other_partner)

        # L'e-mail de facture part après validation de la transaction.
        with self.captureOnCommitCallbacks(execute=True):
            created = generate_partner_invoices(today=TODAY)

        self.assertEqual(len(created), 2)
        invoice = PartnerInvoice.objects.get(partner=self.partner)
        self.assertEqual(invoice.status, PartnerInvoice.Status.PENDING)
        self.assertEqual((invoice.period_start, invoice.period_end), (date(2026, 10, 1), date(2026, 10, 31)))
        self.assertEqual(invoice.marketplace_deliveries_count, 2)
        self.assertEqual(invoice.total_due, Decimal("2300"))
        self.assertEqual(invoice.collection_fees, Decimal("0"))
        self.assertEqual(invoice.balance, Decimal("2300"))
        self.assertEqual(invoice.due_date, date(2026, 11, 17))
        self.assertEqual(set(invoice.deliveries.values_list("id", flat=True)), {d1.id, d2.id})
        current_month.refresh_from_db()
        in_progress.refresh_from_db()
        self.assertIsNone(current_month.invoice_id)
        self.assertIsNone(in_progress.invoice_id)
        self.assertTrue(
            Notification.objects.filter(user=self.partner_user, metadata__kind="partner_invoice").exists()
        )

    def test_invoice_email_not_sent_when_transaction_rolls_back(self):
        from django.db import transaction

        self._delivery(date(2026, 10, 3))
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            try:
                with transaction.atomic():
                    generate_partner_invoices(today=TODAY)
                    raise RuntimeError("échec plus loin dans les tâches quotidiennes")
            except RuntimeError:
                pass
        self.assertEqual(callbacks, [])
        self.assertFalse(PartnerInvoice.objects.exists())
        self.assertFalse(Notification.objects.filter(metadata__kind="partner_invoice").exists())

    def test_generation_is_idempotent_and_catches_up_late_deliveries(self):
        self._delivery(date(2026, 10, 3))
        generate_partner_invoices(today=TODAY)
        self.assertEqual(generate_partner_invoices(today=TODAY), [])
        self.assertEqual(PartnerInvoice.objects.count(), 1)
        # Course d'octobre enregistrée en retard : facturée le mois suivant.
        late = self._delivery(date(2026, 10, 20))
        generate_partner_invoices(today=date(2026, 12, 1))
        late.refresh_from_db()
        self.assertIsNotNone(late.invoice_id)
        self.assertEqual(late.invoice.period_end, date(2026, 11, 30))

    def test_legacy_delivery_without_frozen_cost_uses_zone_cost(self):
        legacy = self._delivery(date(2026, 10, 3), cost=Decimal("0"))
        generate_partner_invoices(today=TODAY)
        legacy.refresh_from_db()
        self.assertEqual(legacy.partner_cost, Decimal("800"))
        self.assertEqual(legacy.invoice.total_due, Decimal("800"))

    def test_admin_lists_and_marks_invoice_paid(self):
        self._delivery(date(2026, 10, 3))
        generate_partner_invoices(today=TODAY)
        invoice = PartnerInvoice.objects.get()
        client = APIClient()
        client.force_authenticate(self.admin)

        pending = client.get("/api/orders/partner-invoices/?status=pending")
        self.assertEqual(pending.status_code, status.HTTP_200_OK)
        self.assertEqual([i["reference"] for i in pending.data["results"]], [invoice.reference])
        self.assertEqual(pending.data["results"][0]["partner_name"], "CityCourier")

        paid = client.post(f"/api/orders/partner-invoices/{invoice.id}/mark-paid/")
        self.assertEqual(paid.status_code, status.HTTP_200_OK, paid.data)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, PartnerInvoice.Status.PAID)
        self.assertIsNotNone(invoice.paid_at)
        again = client.post(f"/api/orders/partner-invoices/{invoice.id}/mark-paid/")
        self.assertEqual(again.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partner_cannot_use_admin_invoice_api_but_sees_detail(self):
        delivery = self._delivery(date(2026, 10, 3))
        generate_partner_invoices(today=TODAY)
        invoice = PartnerInvoice.objects.get()
        client = APIClient()
        client.force_authenticate(self.partner_user)
        self.assertEqual(client.get("/api/orders/partner-invoices/").status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            client.post(f"/api/orders/partner-invoices/{invoice.id}/mark-paid/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        detail = client.get(f"/api/orders/partner/invoices/{invoice.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual([d["id"] for d in detail.data["deliveries"]], [str(delivery.id)])


class PartnerPayoutDetailsTests(TestCase):
    """Coordonnées de versement : saisie par le partenaire, visibles par l'admin."""

    def setUp(self):
        for role_name in (Role.RoleName.PARTNER, Role.RoleName.ADMIN):
            Role.objects.get_or_create(name=role_name)
        self.partner_user = User.objects.create_user(username="p@ex.com", email="p@ex.com", password="x")
        UserRole.objects.create(user=self.partner_user, role=Role.objects.get(name=Role.RoleName.PARTNER))
        self.partner = DeliveryPartner.objects.create(name="CityCourier", user=self.partner_user)
        self.client = APIClient()
        self.client.force_authenticate(self.partner_user)

    def test_partner_sets_wave_number_normalized_and_change_is_traced(self):
        from apps.security.models import SecurityLog

        empty = self.client.get("/api/orders/partner/banks/")
        self.assertEqual(empty.status_code, status.HTTP_200_OK)
        self.assertEqual(empty.data["payout_account"], "")

        response = self.client.patch(
            "/api/orders/partner/banks/",
            {"payout_method": "wave", "payout_account": "77 123 45 67", "payout_holder": " Aliou Fall ",
             "current_password": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.payout_account, "+221771234567")
        self.assertEqual(self.partner.payout_holder, "Aliou Fall")
        self.assertIsNotNone(self.partner.payout_updated_at)
        log = SecurityLog.objects.get(action="PARTNER_PAYOUT_CHANGED")
        self.assertEqual(log.metadata["new"], "…4567")
        self.assertNotIn("771234567", str(log.metadata))
        self.assertTrue(
            Notification.objects.filter(user=self.partner_user, metadata__kind="partner_payout_changed").exists()
        )

    def test_iban_is_normalized_and_invalid_values_rejected(self):
        ok = self.client.patch(
            "/api/orders/partner/banks/",
            {"payout_method": "bank_transfer", "payout_account": "sn04 sn01 0015 2000 0000 1234 5678",
             "payout_holder": "CityCourier SARL", "current_password": "x"},
            format="json",
        )
        self.assertEqual(ok.status_code, status.HTTP_200_OK, ok.data)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.payout_account, "SN04SN0100152000000012345678")

        for payload in (
            {"payout_method": "bank_transfer", "payout_account": "1234", "payout_holder": "X"},
            {"payout_method": "orange_money", "payout_account": "12", "payout_holder": "X"},
            {"payout_method": "wave", "payout_account": "771234567", "payout_holder": ""},
            {"payout_method": "paypal", "payout_account": "771234567", "payout_holder": "X"},
            # Clé de contrôle IBAN fausse (SN08 au lieu de SN04).
            {"payout_method": "bank_transfer", "payout_account": "SN08SN0100152000000012345678", "payout_holder": "X"},
            # Ligne fixe : pas de compte Wave / Orange Money possible.
            {"payout_method": "wave", "payout_account": "33 800 00 00", "payout_holder": "X"},
        ):
            response = self.client.patch(
                "/api/orders/partner/banks/", {**payload, "current_password": "x"}, format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, payload)

    def test_payout_change_requires_current_password(self):
        payload = {"payout_method": "wave", "payout_account": "77 123 45 67", "payout_holder": "Aliou Fall"}
        for password in (None, "mauvais"):
            data = dict(payload) if password is None else {**payload, "current_password": password}
            response = self.client.patch("/api/orders/partner/banks/", data, format="json")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("current_password", response.data)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.payout_account, "")

    @override_settings(ADMIN_NOTIFICATION_EMAIL="ops@sunumall.test")
    def test_holder_change_alone_is_traced_and_admins_alerted(self):
        from django.core import mail
        from apps.security.models import SecurityLog

        self.partner.payout_method = DeliveryPartner.PayoutMethod.WAVE
        self.partner.payout_account = "+221771234567"
        self.partner.payout_holder = "Aliou Fall"
        self.partner.save()
        response = self.client.patch(
            "/api/orders/partner/banks/", {"payout_holder": "Autre Titulaire", "current_password": "x"}, format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(SecurityLog.objects.filter(action="PARTNER_PAYOUT_CHANGED").exists())
        alerts = [m for m in mail.outbox if "ops@sunumall.test" in m.to]
        self.assertEqual(len(alerts), 1)
        self.assertNotIn("771234567", alerts[0].body)

    def test_admin_support_cannot_see_partner_invoices(self):
        Role.objects.get_or_create(name=Role.RoleName.ADMIN_SUPPORT)
        PartnerInvoice.objects.create(
            partner=self.partner, status=PartnerInvoice.Status.PENDING,
            period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), total_due=Decimal("800"),
        )
        support = User.objects.create_user(username="s@ex.com", email="s@ex.com", password="x")
        UserRole.objects.create(user=support, role=Role.objects.get(name=Role.RoleName.ADMIN_SUPPORT))
        self.client.force_authenticate(support)
        self.assertEqual(
            self.client.get("/api/orders/partner-invoices/?status=pending").status_code, status.HTTP_403_FORBIDDEN,
        )

    def test_suspended_partner_is_read_only(self):
        self.partner.status = DeliveryPartner.Status.SUSPENDED
        self.partner.save()
        self.assertEqual(self.client.get("/api/orders/partner/banks/").status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get("/api/orders/partner/invoices/").status_code, status.HTTP_200_OK)
        for method, url, data in (
            ("patch", "/api/orders/partner/banks/",
             {"payout_method": "wave", "payout_account": "771234567", "payout_holder": "X", "current_password": "x"}),
            ("patch", "/api/orders/partner/profile/", {"contact_name": "Autre"}),
            ("post", "/api/orders/partner/api-key/", {}),
        ):
            response = getattr(self.client, method)(url, data, format="json")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, url)
        self.partner.refresh_from_db()
        self.assertEqual(self.partner.payout_account, "")

    def test_admin_sees_payout_details_on_invoices(self):
        self.partner.payout_method = DeliveryPartner.PayoutMethod.ORANGE_MONEY
        self.partner.payout_account = "+221781234567"
        self.partner.payout_holder = "Aliou Fall"
        self.partner.save()
        PartnerInvoice.objects.create(
            partner=self.partner, status=PartnerInvoice.Status.PENDING,
            period_start=date(2026, 10, 1), period_end=date(2026, 10, 31), total_due=Decimal("800"),
        )
        admin = User.objects.create_user(username="a@ex.com", email="a@ex.com", password="x")
        UserRole.objects.create(user=admin, role=Role.objects.get(name=Role.RoleName.ADMIN))
        self.client.force_authenticate(admin)
        response = self.client.get("/api/orders/partner-invoices/?status=pending")
        payout = response.data["results"][0]["partner_payout"]
        self.assertEqual(payout["payout_method"], "orange_money")
        self.assertEqual(payout["payout_account"], "+221781234567")


class PartnerDeliveriesListTests(TestCase):
    """GET /api/orders/partner/deliveries/ : paginé, filtrable, cloisonné."""

    def setUp(self):
        Role.objects.get_or_create(name=Role.RoleName.PARTNER)
        self.partner_user = User.objects.create_user(username="p@ex.com", email="p@ex.com", password="x")
        UserRole.objects.create(user=self.partner_user, role=Role.objects.get(name=Role.RoleName.PARTNER))
        self.partner = DeliveryPartner.objects.create(name="CityCourier", user=self.partner_user)
        other = DeliveryPartner.objects.create(name="Other")
        merchant = User.objects.create_user(username="m@ex.com", email="m@ex.com", password="x")
        store = Store.objects.create(owner=merchant, name="Boutique")
        customer = User.objects.create_user(username="c@ex.com", email="c@ex.com", password="x")
        for i in range(25):
            order = Order.objects.create(customer=customer, store=store, total_amount=1000)
            Delivery.objects.create(
                order=order, partner=self.partner,
                status=Delivery.Status.DELIVERED if i < 20 else Delivery.Status.IN_TRANSIT,
            )
        Delivery.objects.create(
            order=Order.objects.create(customer=customer, store=store, total_amount=1000), partner=other,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.partner_user)

    def test_paginated_and_scoped(self):
        first = self.client.get("/api/orders/partner/deliveries/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["count"], 25)
        self.assertEqual(len(first.data["results"]), 20)
        second = self.client.get("/api/orders/partner/deliveries/?page=2")
        self.assertEqual(len(second.data["results"]), 5)

    def test_status_and_active_filters(self):
        delivered = self.client.get("/api/orders/partner/deliveries/?status=delivered")
        self.assertEqual(delivered.data["count"], 20)
        active = self.client.get("/api/orders/partner/deliveries/?active=1")
        self.assertEqual(active.data["count"], 5)
        self.assertTrue(all(d["status"] == "in_transit" for d in active.data["results"]))
