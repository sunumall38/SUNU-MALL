"""
Tests de non-régression du contrôle d'accès (audit sécurité, phase 1).

Chaque test rejoue une faille constatée et vérifie qu'elle est fermée :
    C2  un admin spécialisé ne peut plus s'attribuer de rôle ni de permission ;
    C4  un vendeur ne peut plus modifier ni supprimer un retrait ;
    C5  un commerçant ne peut plus s'activer un abonnement sans payer ;
    C6  une commande ne se modifie ni ne se supprime par l'API générique ;
    C7  un commerçant ne peut plus publier ni réactiver seul sa boutique.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import Store
from apps.commissions.models import Payout
from apps.kyc.models import SellerKYC
from apps.monetization.models import Subscription, SubscriptionPlan
from apps.orders.models import Order
from apps.users.models import Permission, Role, RolePermission, User, UserRole


class AccessControlTestCase(TestCase):
    def make_user(self, email, *role_names):
        user = User.objects.create_user(
            username=email, email=email, password="testpass123", is_verified=True
        )
        for name in role_names:
            role, _ = Role.objects.get_or_create(name=name)
            UserRole.objects.create(user=user, role=role)
        return user

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def setUp(self):
        self.super_admin = self.make_user("super@example.com", Role.RoleName.SUPER_ADMIN)
        self.support_admin = self.make_user("support@example.com", Role.RoleName.ADMIN_SUPPORT)
        self.merchant = self.make_user("merchant@example.com", Role.RoleName.MERCHANT)
        self.customer = self.make_user("customer@example.com", Role.RoleName.CLIENT)


class RoleEscalationTests(AccessControlTestCase):
    """C2 — attribution des rôles et permissions réservée au super admin."""

    def test_specialised_admin_cannot_grant_himself_super_admin(self):
        role = Role.objects.get(name=Role.RoleName.SUPER_ADMIN)
        response = self.as_user(self.support_admin).post(
            "/api/users/user-roles/", {"user": str(self.support_admin.id), "role": role.id}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(self.support_admin.is_super_admin())

    def test_specialised_admin_cannot_remove_a_role(self):
        assignment = UserRole.objects.get(user=self.super_admin)
        response = self.as_user(self.support_admin).delete(
            f"/api/users/user-roles/{assignment.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(UserRole.objects.filter(pk=assignment.pk).exists())

    def test_specialised_admin_cannot_add_permission_to_his_role(self):
        role = Role.objects.get(name=Role.RoleName.ADMIN_SUPPORT)
        permission, _ = Permission.objects.get_or_create(
            code="admins.manage", defaults={"label": "Gérer les administrateurs"}
        )
        response = self.as_user(self.support_admin).post(
            "/api/users/role-permissions/", {"role": role.id, "permission": permission.id}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(RolePermission.objects.filter(role=role, permission=permission).exists())

    def test_specialised_admin_can_still_read_assignments(self):
        response = self.as_user(self.support_admin).get("/api/users/user-roles/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_super_admin_can_grant_a_role(self):
        role = Role.objects.get(name=Role.RoleName.ADMIN_SUPPORT)
        response = self.as_user(self.super_admin).post(
            "/api/users/user-roles/", {"user": str(self.customer.id), "role": role.id}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_specialised_admin_cannot_edit_or_delete_accounts(self):
        client = self.as_user(self.support_admin)
        for target in (self.super_admin, self.customer):
            response = client.patch(f"/api/users/{target.id}/", {"is_active": False})
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            response = client.delete(f"/api/users/{target.id}/")
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            target.refresh_from_db()
            self.assertTrue(target.is_active)

    def test_specialised_admin_can_still_list_users(self):
        response = self.as_user(self.support_admin).get("/api/users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_super_admin_can_deactivate_an_account(self):
        response = self.as_user(self.super_admin).patch(
            f"/api/users/{self.customer.id}/", {"is_active": False}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)


class PayoutTamperingTests(AccessControlTestCase):
    """C4 — un retrait ne se modifie ni ne se supprime après sa création."""

    def setUp(self):
        super().setUp()
        self.payout = Payout.objects.create(
            seller=self.merchant, amount=Decimal("1000"), reference="PO-TEST-1"
        )

    def test_seller_cannot_change_payout_amount(self):
        client = self.as_user(self.merchant)
        url = f"/api/commissions/payouts/{self.payout.id}/"
        for method in (client.patch, client.put):
            response = method(url, {"amount": "10000000", "method": "wave"})
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.payout.refresh_from_db()
        self.assertEqual(self.payout.amount, Decimal("1000"))

    def test_seller_cannot_delete_payout(self):
        response = self.as_user(self.merchant).delete(
            f"/api/commissions/payouts/{self.payout.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Payout.objects.filter(pk=self.payout.pk).exists())

    def test_seller_can_still_read_his_payout(self):
        response = self.as_user(self.merchant).get(
            f"/api/commissions/payouts/{self.payout.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class SubscriptionTamperingTests(AccessControlTestCase):
    """C5 — un abonnement ne s'active que par un paiement ou par l'administration."""

    def setUp(self):
        super().setUp()
        self.starter = SubscriptionPlan.objects.create(
            code="T-STARTER", name="T-STARTER", price=2500, billing_cycle="monthly",
            max_products=10,
        )
        self.business = SubscriptionPlan.objects.create(
            code="T-BUSINESS", name="T-BUSINESS", price=7500, billing_cycle="monthly",
        )
        today = timezone.now().date()
        self.subscription = Subscription.objects.create(
            plan=self.starter, subscriber_type="merchant", subscriber_id=self.merchant.id,
            status=Subscription.Status.SUSPENDED,
            starts_at=today, ends_at=today + timedelta(days=30),
        )
        self.url = f"/api/monetization/subscription/{self.subscription.id}/"

    def test_merchant_cannot_activate_or_upgrade_his_subscription(self):
        response = self.as_user(self.merchant).patch(self.url, {
            "status": "active", "ends_at": "2099-01-01", "plan": self.business.id,
        })
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.SUSPENDED)
        self.assertEqual(self.subscription.plan_id, self.starter.id)

    def test_nobody_can_delete_a_subscription(self):
        for user in (self.merchant, self.super_admin):
            response = self.as_user(user).delete(self.url)
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Subscription.objects.filter(pk=self.subscription.pk).exists())

    def test_admin_without_subscription_permission_cannot_write(self):
        response = self.as_user(self.support_admin).patch(self.url, {"status": "active"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_super_admin_can_reactivate_a_subscription(self):
        response = self.as_user(self.super_admin).patch(self.url, {"status": "active"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.status, Subscription.Status.ACTIVE)


class OrderTamperingTests(AccessControlTestCase):
    """C6 — une commande ne se modifie ni ne se supprime par l'API générique."""

    def setUp(self):
        super().setUp()
        self.store = Store.objects.create(
            owner=self.merchant, name="Boutique Test", status=Store.Status.ACTIVE
        )
        self.other_store = Store.objects.create(
            owner=self.make_user("other@example.com", Role.RoleName.MERCHANT),
            name="Autre Boutique", status=Store.Status.ACTIVE,
        )
        self.order = Order.objects.create(
            customer=self.customer, store=self.store,
            total_amount=Decimal("12000"), delivery_fee=Decimal("2000"),
        )
        self.url = f"/api/orders/{self.order.id}/"

    def test_seller_cannot_change_delivery_fee_or_store(self):
        client = self.as_user(self.merchant)
        response = client.patch(self.url, {
            "delivery_fee": "12000", "store": str(self.other_store.id),
        })
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.order.refresh_from_db()
        self.assertEqual(self.order.delivery_fee, Decimal("2000"))
        self.assertEqual(self.order.store_id, self.store.id)

    def test_order_cannot_be_deleted_by_any_party(self):
        for user in (self.customer, self.merchant, self.super_admin):
            response = self.as_user(user).delete(self.url)
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(Order.objects.filter(pk=self.order.pk).exists())

    def test_direct_order_creation_is_refused(self):
        response = self.as_user(self.customer).post(
            "/api/orders/", {"store": str(self.store.id)}
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(Order.objects.count(), 1)

    def test_parties_can_still_read_the_order(self):
        for user in (self.customer, self.merchant):
            response = self.as_user(user).get(self.url)
            self.assertEqual(response.status_code, status.HTTP_200_OK)


class StoreModerationBypassTests(AccessControlTestCase):
    """C7 — seul l'administration publie, suspend ou réactive une boutique."""

    def setUp(self):
        super().setUp()
        SellerKYC.objects.create(
            seller=self.merchant, status=SellerKYC.Status.VERIFIED,
            document_type="cni", document_front="kyc/seller/x/front.jpg",
            document_back="kyc/seller/x/back.jpg",
        )

    def test_merchant_cannot_create_an_already_active_store(self):
        response = self.as_user(self.merchant).post(
            "/api/catalog/stores/", {"name": "Ma Boutique", "status": "active"}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        store = Store.objects.get(owner=self.merchant)
        self.assertEqual(store.status, Store.Status.INACTIVE)

    def test_merchant_cannot_reactivate_a_suspended_store(self):
        store = Store.objects.create(
            owner=self.merchant, name="Suspendue", status=Store.Status.SUSPENDED
        )
        response = self.as_user(self.merchant).patch(
            f"/api/catalog/stores/{store.id}/", {"status": "active", "city": "Thiès"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.SUSPENDED)
        # Les champs légitimes restent modifiables par le propriétaire.
        self.assertEqual(store.city, "Thiès")

    def test_admin_can_still_change_store_status(self):
        store = Store.objects.create(
            owner=self.merchant, name="À suspendre", status=Store.Status.ACTIVE
        )
        response = self.as_user(self.super_admin).patch(
            f"/api/catalog/stores/{store.id}/", {"status": "suspended"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.SUSPENDED)


class GuestCheckoutTakeoverTests(AccessControlTestCase):
    """C3 — l'achat invité n'ouvre ni ne modifie jamais un compte existant."""

    PAYLOAD = {"first_name": "Pirate", "last_name": "X", "phone": "+221 70 000 00 00"}

    def make_guest(self, email="guest@example.com"):
        guest = User.objects.create_user(
            username=email, email=email, first_name="Awa", phone="+221 77 111 11 11",
        )
        guest.set_unusable_password()
        guest.save()
        return guest

    def test_existing_guest_account_gets_no_tokens_and_is_untouched(self):
        guest = self.make_guest()
        response = APIClient().post(
            "/api/auth/guest-checkout/", {**self.PAYLOAD, "email": guest.email}
        )
        # Aucune session : seulement un lien envoyé à l'adresse du compte.
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertNotIn("access", response.data)
        self.assertNotIn("refresh", response.data)
        guest.refresh_from_db()
        self.assertEqual(guest.first_name, "Awa")
        self.assertEqual(guest.phone, "+221 77 111 11 11")

    def test_email_case_variant_does_not_bypass_the_check(self):
        self.make_guest("guest@example.com")
        response = APIClient().post(
            "/api/auth/guest-checkout/", {**self.PAYLOAD, "email": "Guest@Example.com"}
        )
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertNotIn("access", response.data)
        self.assertEqual(User.objects.filter(email__iexact="guest@example.com").count(), 1)

    def test_account_with_password_is_still_refused(self):
        response = APIClient().post(
            "/api/auth/guest-checkout/", {**self.PAYLOAD, "email": self.customer.email}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_new_email_still_creates_a_guest_session(self):
        response = APIClient().post(
            "/api/auth/guest-checkout/", {**self.PAYLOAD, "email": "nouveau@example.com"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        user = User.objects.get(email="nouveau@example.com")
        self.assertFalse(user.has_usable_password())
        self.assertTrue(user.has_role(Role.RoleName.CLIENT))

    def test_set_password_refused_when_account_already_has_one(self):
        response = self.as_user(self.customer).post(
            "/api/auth/set-password/", {"password": "Nouveau-Secret-2026"}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.check_password("testpass123"))

    def test_guest_can_set_a_strong_password_but_not_a_common_one(self):
        guest = self.make_guest()
        client = self.as_user(guest)
        weak = client.post("/api/auth/set-password/", {"password": "12345678"})
        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        strong = client.post("/api/auth/set-password/", {"password": "Tabaski-Dakar-2026"})
        self.assertEqual(strong.status_code, status.HTTP_200_OK)
        guest.refresh_from_db()
        self.assertTrue(guest.check_password("Tabaski-Dakar-2026"))


@override_settings(PHONE_OTP_REVEAL_CODE=False)
class PhoneOtpLeakTests(AccessControlTestCase):
    """Le code OTP du téléphone n'est lisible nulle part côté utilisateur."""

    def setUp(self):
        super().setUp()
        self.customer.phone = "+221 77 123 45 67"
        self.customer.save(update_fields=["phone"])
        self.api = self.as_user(self.customer)

    def request_otp(self):
        from unittest.mock import patch

        from apps.users.models import PhoneOTP

        with patch.object(PhoneOTP, "generate_code", return_value="482913"):
            return self.api.post("/api/auth/request-phone-otp/", {}, format="json")

    def test_code_is_not_stored_in_the_notification(self):
        from apps.monetization.models import Notification

        response = self.request_otp()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("debug_code", response.data)
        notification = Notification.objects.get(user=self.customer)
        self.assertNotIn("482913", notification.message)
        self.assertNotIn("482913", str(notification.metadata))

    def test_code_is_not_readable_through_the_notifications_api(self):
        self.request_otp()
        response = self.api.get("/api/monetization/notifications/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("482913", response.content.decode())

    def test_code_is_still_handed_to_the_sms_channel(self):
        from unittest.mock import patch

        from apps.monetization.models import Notification

        with patch.object(Notification, "_send_sms") as send_sms:
            self.request_otp()
        (body,), _ = send_sms.call_args
        self.assertIn("482913", body)

    def test_codes_come_from_a_cryptographic_generator(self):
        from unittest.mock import patch

        from apps.users.models import PhoneOTP

        with patch("secrets.randbelow", return_value=42) as randbelow:
            self.assertEqual(PhoneOTP.generate_code(), "000042")
        randbelow.assert_called_once_with(10 ** 6)

    def test_failed_attempts_are_counted_in_the_database(self):
        from apps.users.models import PhoneOTP

        self.request_otp()
        otp = PhoneOTP.objects.get(user=self.customer)
        stale_copy = PhoneOTP.objects.get(pk=otp.pk)
        self.assertFalse(otp.verify("000000", 5))
        # Une seconde requête partie avec l'ancien compteur ne l'écrase pas.
        self.assertFalse(stale_copy.verify("111111", 5))
        otp.refresh_from_db()
        self.assertEqual(otp.attempts, 2)

    def test_otp_requests_are_rate_limited_per_account(self):
        from unittest.mock import patch

        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle

        cache.clear()
        rates = {"phone_otp_request": "2/hour", "phone_otp_verify": "20/hour", "ai": "20/hour"}
        with patch.object(ScopedRateThrottle, "THROTTLE_RATES", rates):
            statuses = [self.request_otp().status_code for _ in range(3)]
        cache.clear()
        self.assertEqual(statuses, [201, 201, 429])


@override_settings(FRONTEND_URL="https://shop.example")
class GuestLoginLinkTests(AccessControlTestCase):
    """Un client invité qui revient se reconnecte par un lien reçu par email."""

    PAYLOAD = {"first_name": "Awa", "phone": "+221 77 111 11 11"}

    def setUp(self):
        super().setUp()
        self.guest = User.objects.create_user(
            username="guest@example.com", email="guest@example.com", first_name="Awa",
        )
        self.guest.set_unusable_password()
        self.guest.save()

    def request_link(self, email="guest@example.com"):
        return APIClient().post("/api/auth/guest-checkout/", {**self.PAYLOAD, "email": email})

    def token_from_last_email(self):
        import re

        from django.core import mail

        return re.search(r"guest-login\?token=([\w-]+)", mail.outbox[-1].body).group(1)

    def test_link_is_emailed_to_the_account_address_only(self):
        from django.core import mail

        response = self.request_link()
        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(response.data["login_link_sent"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["guest@example.com"])
        self.assertIn("https://shop.example/guest-login?token=", mail.outbox[0].body)
        # Le jeton n'apparaît jamais dans la réponse HTTP.
        self.assertNotIn(self.token_from_last_email(), response.content.decode())

    def test_token_is_stored_hashed(self):
        from apps.users.models import Token

        self.request_link()
        raw = self.token_from_last_email()
        stored = Token.objects.get(user=self.guest, type=Token.TokenType.GUEST_LOGIN)
        self.assertNotEqual(stored.token, raw)
        self.assertEqual(len(stored.token), 64)

    def test_link_opens_a_session_once(self):
        self.request_link()
        raw = self.token_from_last_email()
        first = APIClient().post("/api/auth/guest-login/", {"token": raw})
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["user"]["email"], "guest@example.com")
        self.assertIn("access", first.data)
        self.guest.refresh_from_db()
        self.assertTrue(self.guest.is_verified)
        # Le jeton d'accès émis donne bien accès au compte.
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {first.data['access']}")
        self.assertEqual(client.get("/api/orders/").status_code, status.HTTP_200_OK)

        second = APIClient().post("/api/auth/guest-login/", {"token": raw})
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn("access", second.data)

    def test_expired_link_is_refused(self):
        from apps.users.models import Token

        self.request_link()
        raw = self.token_from_last_email()
        Token.objects.filter(user=self.guest).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        response = APIClient().post("/api/auth/guest-login/", {"token": raw})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_or_missing_token_is_refused(self):
        for payload in ({"token": "nimporte-quoi"}, {"token": ""}, {}):
            response = APIClient().post("/api/auth/guest-login/", payload)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_repeated_requests_do_not_flood_the_mailbox(self):
        from django.core import mail

        for _ in range(4):
            self.assertEqual(self.request_link().status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(GUEST_LOGIN_LINK_COOLDOWN_SECONDS=0)
    def test_a_new_link_revokes_the_previous_one(self):
        self.request_link()
        first = self.token_from_last_email()
        self.request_link()
        second = self.token_from_last_email()
        self.assertNotEqual(first, second)
        self.assertEqual(
            APIClient().post("/api/auth/guest-login/", {"token": first}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            APIClient().post("/api/auth/guest-login/", {"token": second}).status_code,
            status.HTTP_200_OK,
        )

    def test_link_stops_working_once_a_password_is_set(self):
        self.request_link()
        raw = self.token_from_last_email()
        self.guest.set_password("Tabaski-Dakar-2026")
        self.guest.save()
        response = APIClient().post("/api/auth/guest-login/", {"token": raw})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_account_with_password_gets_no_link(self):
        from django.core import mail

        response = self.request_link(self.customer.email)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)
