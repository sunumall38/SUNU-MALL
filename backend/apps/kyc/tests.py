"""
Tests du module KYC — vendeurs et livreurs restent STRICTEMENT séparés.

Spec §22 : 10 tests obligatoires
1. Dépôt vendeur : 201 + pièces dans `kyc/sellers/seller_{user_id}/{kyc_id}/`
2. Dépôt livreur : 201 + pièces dans `kyc/drivers/driver_{user_id}/{kyc_id}/`
3. Client : 403 au dépôt vendeur
4. Croisé : un LIVREUR ne peut pas déposer un dossier vendeur (403)
5. Croisé : un VENDEUR ne peut pas déposer un dossier livreur (403)
6. IDs fournis au payload : totalement ignorés → le propriétaire reste
   `request.user`, jamais ce qui est envoyé
7. Séparation admin : les listes "vendeurs" et "livreurs" sont distinctes
8. Immuabilité : le propriétaire d'un dossier ne change JAMAIS
9. Approbation admin : VERIFIED + notification + trace d'audit
10. Rejet admin : REJECTED + motif + notification + trace d'audit

Ensuite : les gating (§21) boutique/livraison et l'accès aux pièces.
"""
import importlib
import shutil
import tempfile
from datetime import timedelta

from django.apps import apps as django_apps
from django.conf import settings
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.catalog.models import Product, ProductVariant, Store, StoreCategory
from apps.commissions.models import SellerSubscription
from apps.kyc.models import DriverKYC, KYCAuditLog, SellerKYC, VerificationHistory
from apps.monetization.models import Notification
from apps.security.models import SecurityLog
from apps.users.models import Role, User

KYC_FS = override_settings(KYC_STORAGE_BACKEND="fs")


def make_user(email, role_name):
    user = User.objects.create_user(
        username=email.split("@")[0],
        email=email,
        password="TestPass123!",
        first_name="Aminata",
        last_name="Diallo",
    )
    role = Role.objects.get_or_create(name=role_name)[0]
    user.user_roles.create(role=role)
    return user


def cni_upload(name="front.jpg"):
    return SimpleUploadedFile(name, b"\xff\xd8\xff\xe0" + b"0123456789" * 256, content_type="image/jpeg")


@KYC_FS
class KYCSubmitTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.override_storage = override_settings(KYC_STORAGE_LOCATION=self.tmp)
        self.override_storage.enable()
        self.addCleanup(self.override_storage.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.merchant = make_user("merchant@sunu.test", Role.RoleName.MERCHANT)
        self.driver = make_user("driver@sunu.test", Role.RoleName.DRIVER)
        self.client_user = make_user("client@sunu.test", Role.RoleName.CLIENT)
        self.admin = make_user("admin@sunu.test", Role.RoleName.ADMIN)

        self.client = APIClient()

    def _submit(self, path, user, **extra):
        self.client.force_authenticate(user)
        payload = {
            "document_type": "cni",
            "document_front": cni_upload("front.jpg"),
            "document_back": cni_upload("back.jpg"),
            **extra,
        }
        return self.client.post(path, payload, format="multipart")

    def test_specialized_admin_permissions_are_enforced(self):
        marketplace_admin = make_user("marketplace-admin@sunu.test", Role.RoleName.ADMIN_MARKETPLACE)
        kyc_admin = make_user("kyc-admin@sunu.test", Role.RoleName.ADMIN_KYC)
        dossier = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni",
            document_front="kyc/sellers/test/front.jpg",
            document_back="kyc/sellers/test/back.jpg",
            status=SellerKYC.Status.SUBMITTED,
        )

        self.client.force_authenticate(marketplace_admin)
        self.assertEqual(self.client.get("/api/kyc/seller-kyc/").status_code, 403)
        self.assertEqual(self.client.post(f"/api/kyc/seller-kyc/{dossier.id}/approve/").status_code, 403)

        self.client.force_authenticate(kyc_admin)
        self.assertEqual(self.client.get("/api/kyc/seller-kyc/").status_code, 200)
        self.assertEqual(self.client.post(f"/api/kyc/seller-kyc/{dossier.id}/approve/").status_code, 200)

    def test_deleting_owner_removes_private_kyc_files(self):
        self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        dossier = SellerKYC.objects.get(seller=self.merchant)
        front = dossier.document_front
        back = dossier.document_back
        from apps.kyc.storage import get_kyc_storage

        storage = get_kyc_storage()
        self.assertTrue(storage.exists(front))
        self.assertTrue(storage.exists(back))
        self.merchant.delete()
        self.assertFalse(storage.exists(front))
        self.assertFalse(storage.exists(back))

    # --- 1 & 2 : dépôt et séparation des chemins MinIO ---

    def test_seller_submit_201_and_private_path(self):
        response = self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        self.assertEqual(response.status_code, 201, response.data)

        kyc = SellerKYC.objects.get(seller=self.merchant)
        # Depuis la spec §8, le dépôt de dossier passe en SUBMITTED (prêt à
        # être examiné) — PENDING ne désignant que le dossier créé à
        # l'inscription, en attente de soumission.
        self.assertEqual(kyc.status, SellerKYC.Status.SUBMITTED)
        self.assertIn(f"kyc/sellers/seller_{self.merchant.id}/{kyc.id}/", kyc.document_front)
        self.assertIn(f"kyc/sellers/seller_{self.merchant.id}/{kyc.id}/", kyc.document_back)
        self.assertTrue(kyc.document_front.endswith("front.jpg"))
        self.assertTrue(kyc.document_back.endswith("back.jpg"))

    def test_seller_submit_records_verification_history_and_security_log(self):
        self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        kyc = SellerKYC.objects.get(seller=self.merchant)
        history = kyc.history.first()
        self.assertIsNotNone(history)
        self.assertEqual(history.previous_status, SellerKYC.Status.PENDING)
        self.assertEqual(history.new_status, SellerKYC.Status.SUBMITTED)
        from apps.security.models import SecurityLog
        self.assertTrue(
            SecurityLog.objects.filter(user=self.merchant, action=SecurityLog.Action.KYC_DOCUMENT_UPLOAD).exists()
        )

    def test_seller_resubmission_is_200(self):
        self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        second = self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(SellerKYC.objects.filter(seller=self.merchant).count(), 1)

    def test_driver_submit_201_and_private_path(self):
        response = self._submit("/api/kyc/driver-kyc/submit/", self.driver)
        self.assertEqual(response.status_code, 201, response.data)

        kyc = DriverKYC.objects.get(driver=self.driver)
        self.assertIn(f"kyc/drivers/driver_{self.driver.id}/{kyc.id}/", kyc.document_front)
        self.assertIn(f"kyc/drivers/driver_{self.driver.id}/{kyc.id}/", kyc.document_back)

    # --- 3, 4 & 5 : rôles et croisements ---

    def test_client_cannot_submit_seller_kyc(self):
        response = self._submit("/api/kyc/seller-kyc/submit/", self.client_user)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(SellerKYC.objects.count(), 0)

    def test_driver_cannot_submit_seller_kyc(self):
        response = self._submit("/api/kyc/seller-kyc/submit/", self.driver)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(SellerKYC.objects.count(), 0)

    def test_merchant_cannot_submit_driver_kyc(self):
        response = self._submit("/api/kyc/driver-kyc/submit/", self.merchant)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(DriverKYC.objects.count(), 0)

    # --- 6 : le propriétaire vient du compte connecté, jamais du payload ---

    def test_payload_owner_fields_are_rejected(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.post(
            "/api/kyc/seller-kyc/submit/",
            {
                "document_type": "cni",
                "document_front": cni_upload("front.jpg"),
                "document_back": cni_upload("back.jpg"),
                "seller_id": str(self.driver.id),  # tentative de vol/erreur
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(SellerKYC.objects.count(), 0)

    def test_submitted_owner_is_always_request_user(self):
        self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        kyc = SellerKYC.objects.get()
        self.assertEqual(kyc.seller_id, self.merchant.id)
        self.assertNotEqual(kyc.seller_id, self.driver.id)

    def test_me_returns_own_dossier_or_404(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.get("/api/kyc/seller-kyc/me/")
        self.assertEqual(response.status_code, 404)
        self._submit("/api/kyc/seller-kyc/submit/", self.merchant)
        response = self.client.get("/api/kyc/seller-kyc/me/")
        self.assertEqual(response.status_code, 200)

    # --- 7 : listes admin strictement séparées par type ---

    def test_admin_lists_are_separated_by_type(self):
        seller_kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        driver_kyc = DriverKYC.objects.create(
            driver=self.driver,
            document_type="cni", document_front="kyc/drivers/1/f.jpg", document_back="kyc/drivers/1/b.jpg",
        )
        self.client.force_authenticate(self.admin)

        sellers = self.client.get("/api/kyc/seller-kyc/")
        self.assertEqual(sellers.status_code, 200)
        self.assertEqual(sellers.data["count"], 1)
        self.assertEqual(sellers.data["results"][0]["id"], str(seller_kyc.id))
        self.assertTrue(all("driver" not in r for r in sellers.data["results"]))

        drivers = self.client.get("/api/kyc/driver-kyc/")
        self.assertEqual(drivers.status_code, 200)
        self.assertEqual(drivers.data["count"], 1)
        self.assertEqual(drivers.data["results"][0]["id"], str(driver_kyc.id))

    def test_admin_only_can_list_kyc(self):
        self.client.force_authenticate(self.merchant)
        self.assertEqual(self.client.get("/api/kyc/seller-kyc/").status_code, 403)
        self.client.force_authenticate(self.driver)
        self.assertEqual(self.client.get("/api/kyc/driver-kyc/").status_code, 403)

    # --- 8 : immuabilité de l'association ---

    def test_no_update_endpoint_exists(self):
        seller_kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.put(f"/api/kyc/seller-kyc/{seller_kyc.id}/", {"seller": self.driver.id}).status_code, 405)
        self.assertEqual(self.client.patch(f"/api/kyc/seller-kyc/{seller_kyc.id}/", {"seller": self.driver.id}).status_code, 405)
        seller_kyc.refresh_from_db()
        self.assertEqual(seller_kyc.seller_id, self.merchant.id)

    def test_owner_role_mismatch_blocks_admin_actions(self):
        seller_kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        # On retire le rôle "merchant" au propriétaire : le dossier devient
        # incohérent (un vendeur "démuselé" n'est plus un vendeur) et toute
        # action admin doit être bloquée.
        self.merchant.user_roles.all().delete()
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"/api/kyc/seller-kyc/{seller_kyc.id}/approve/").status_code, 400)
        self.assertEqual(self.client.post(f"/api/kyc/seller-kyc/{seller_kyc.id}/reject/", {"reason": "x"}).status_code, 400)

    # --- 9 & 10 : approbation / rejet admin ---

    def test_admin_approve_verified_notification_and_audit(self):
        kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/kyc/seller-kyc/{kyc.id}/approve/")
        self.assertEqual(response.status_code, 200, response.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.VERIFIED)
        self.assertIsNotNone(kyc.verified_at)

        self.assertTrue(
            Notification.objects.filter(user=self.merchant, subject__contains="vérifiée", status=Notification.Status.SENT).exists()
        )
        self.assertTrue(
            KYCAuditLog.objects.filter(action=KYCAuditLog.Action.ADMIN_APPROVE_SELLER_KYC, admin=self.admin, kyc_id=str(kyc.id)).exists()
        )

    def test_admin_reject_with_reason_notification_and_audit(self):
        kyc = DriverKYC.objects.create(
            driver=self.driver,
            document_type="cni", document_front="kyc/drivers/1/f.jpg", document_back="kyc/drivers/1/b.jpg",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/kyc/driver-kyc/{kyc.id}/reject/", {"reason": "Photo floue"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, DriverKYC.Status.REJECTED)
        self.assertEqual(kyc.rejection_reason, "Photo floue")

        notification = Notification.objects.filter(user=self.driver).first()
        self.assertIsNotNone(notification)
        self.assertIn("Photo floue", notification.message)
        self.assertTrue(
            KYCAuditLog.objects.filter(action=KYCAuditLog.Action.ADMIN_REJECT_DRIVER_KYC, admin=self.admin, kyc_id=str(kyc.id)).exists()
        )

    def test_view_logs_audit(self):
        kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/kyc/seller-kyc/{kyc.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["document_front"], "kyc/sellers/1/f.jpg")
        self.assertTrue(
            KYCAuditLog.objects.filter(action=KYCAuditLog.Action.ADMIN_VIEW_SELLER_KYC, admin=self.admin).exists()
        )

    def test_driver_cannot_access_seller_documents(self):
        kyc = SellerKYC.objects.create(
            seller=self.merchant,
            document_type="cni", document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        self.client.force_authenticate(self.driver)
        self.assertEqual(self.client.get(f"/api/kyc/seller-kyc/{kyc.id}/").status_code, 403)


@KYC_FS
class KYCGatingTests(TestCase):
    """Sans pièce d'identité validée, ni vente ni courses (la boutique se crée avant)."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.override_storage = override_settings(KYC_STORAGE_LOCATION=self.tmp)
        self.override_storage.enable()
        self.addCleanup(self.override_storage.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.merchant = make_user("m@sunu.test", Role.RoleName.MERCHANT)
        self.driver = make_user("d@sunu.test", Role.RoleName.DRIVER)
        self.client = APIClient()

    def _verify_seller(self):
        return SellerKYC.objects.create(
            seller=self.merchant, document_type="cni",
            document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
            status=SellerKYC.Status.VERIFIED, submitted_at=None,
        )

    def _verify_driver(self):
        return DriverKYC.objects.create(
            driver=self.driver, document_type="cni",
            document_front="kyc/drivers/1/f.jpg", document_back="kyc/drivers/1/b.jpg",
            status=DriverKYC.Status.VERIFIED, submitted_at=None,
        )

    def test_merchant_creates_store_before_sending_kyc(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.post("/api/catalog/stores/", {"name": "Boutique test"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], Store.Status.INACTIVE)

    def test_merchant_can_submit_store_once_kyc_is_sent(self):
        kyc = self._verify_seller()
        kyc.mark_submitted()
        self.client.force_authenticate(self.merchant)
        response = self.client.post("/api/catalog/stores/", {"name": "Boutique test"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], Store.Status.INACTIVE)

    def test_merchant_with_rejected_kyc_can_still_create_store(self):
        # La boutique attend la nouvelle pièce pour partir en examen.
        self._verify_seller().mark_rejected("Photo illisible")
        self.client.force_authenticate(self.merchant)
        response = self.client.post("/api/catalog/stores/", {"name": "Boutique test"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["status"], Store.Status.INACTIVE)

    def test_merchant_can_create_store_with_verified_kyc(self):
        self._verify_seller()
        self.client.force_authenticate(self.merchant)
        category = StoreCategory.objects.create(name="Alimentation")
        response = self.client.post(
            "/api/catalog/stores/", {"name": "Boutique test", "category": category.id}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_driver_cannot_go_available_without_verified_kyc(self):
        self.client.force_authenticate(self.driver)
        response = self.client.patch("/api/orders/drivers/me/", {"availability_status": "available"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_driver_can_go_offline_without_verified_kyc(self):
        self.client.force_authenticate(self.driver)
        response = self.client.patch("/api/orders/drivers/me/", {"availability_status": "offline"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_driver_can_go_available_with_verified_kyc(self):
        self._verify_driver()
        self.client.force_authenticate(self.driver)
        response = self.client.patch("/api/orders/drivers/me/", {"availability_status": "available"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["availability_status"], "available")


@KYC_FS
class KYCAdminWorkflowTests(TestCase):
    """Nouveaux statuts et actions admin (spec §8, §11, §12) : start_review,
    request_resubmission, suspend, block + filtre par statut."""

    def setUp(self):
        self.merchant = make_user("m2@sunu.test", Role.RoleName.MERCHANT)
        self.admin = make_user("admin2@sunu.test", Role.RoleName.ADMIN)
        self.client = APIClient()

    def _kyc(self, status=None):
        return SellerKYC.objects.create(
            seller=self.merchant, document_type="cni",
            document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
            status=status or SellerKYC.Status.VERIFIED,
        )

    def _admin_post(self, kyc, action, data=None):
        self.client.force_authenticate(self.admin)
        return self.client.post(f"/api/kyc/seller-kyc/{kyc.id}/{action}/", data or {}, format="json")

    def test_start_review_sets_under_review_and_history(self):
        kyc = self._kyc(status=SellerKYC.Status.SUBMITTED)
        response = self._admin_post(kyc, "start-review")
        self.assertEqual(response.status_code, 200, response.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.UNDER_REVIEW)

        history = VerificationHistory.objects.filter(kyc=kyc).latest("created_at")
        self.assertEqual(history.previous_status, SellerKYC.Status.SUBMITTED)
        self.assertEqual(history.new_status, SellerKYC.Status.UNDER_REVIEW)
        self.assertEqual(history.reviewed_by, self.admin)

    def test_request_resubmission_requires_reason(self):
        kyc = self._kyc(status=SellerKYC.Status.REJECTED)
        no_reason = self._admin_post(kyc, "request-resubmission")
        self.assertEqual(no_reason.status_code, 400)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.REJECTED)

        with_reason = self._admin_post(kyc, "request-resubmission", {"reason": "Photo illisible"})
        self.assertEqual(with_reason.status_code, 200, with_reason.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.REJECTED)
        self.assertTrue(
            Notification.objects.filter(user=self.merchant, metadata__kind="kyc_resubmission").exists()
        )
        self.assertTrue(
            KYCAuditLog.objects.filter(action=KYCAuditLog.Action.ADMIN_RESUBMIT_SELLER_KYC).exists()
        )
        self.assertTrue(
            SecurityLog.objects.filter(user=self.merchant, action=SecurityLog.Action.KYC_REQUEST_RESUBMISSION).exists()
        )

    def test_suspend_cuts_selling_and_blocks_new_submission(self):
        kyc = self._kyc()
        response = self._admin_post(kyc, "suspend", {"reason": "Litige en cours"})
        self.assertEqual(response.status_code, 200, response.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.SUSPENDED)
        self.assertFalse(kyc.can_sell)
        self.assertTrue(
            SecurityLog.objects.filter(user=self.merchant, action=SecurityLog.Action.KYC_SUSPENDED).exists()
        )

        # Un compte suspendu ne peut plus soumettre de nouveau dossier.
        self.client.force_authenticate(self.merchant)
        blocked = self.client.post(
            "/api/kyc/seller-kyc/submit/",
            {
                "document_type": "cni",
                "document_front": cni_upload("front.jpg"),
                "document_back": cni_upload("back.jpg"),
            },
            format="multipart",
        )
        self.assertEqual(blocked.status_code, 400)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.SUSPENDED)

    def test_block_sets_blocked_with_logs(self):
        kyc = self._kyc()
        response = self._admin_post(kyc, "block", {"reason": "Fraude avérée"})
        self.assertEqual(response.status_code, 200, response.data)
        kyc.refresh_from_db()
        self.assertEqual(kyc.status, SellerKYC.Status.BLOCKED)
        self.assertTrue(
            SecurityLog.objects.filter(user=self.merchant, action=SecurityLog.Action.KYC_BLOCKED).exists()
        )
        self.assertTrue(
            KYCAuditLog.objects.filter(action=KYCAuditLog.Action.ADMIN_BLOCK_SELLER_KYC).exists()
        )
        self.assertTrue(Notification.objects.filter(user=self.merchant, metadata__kind="kyc_blocked").exists())

    def test_status_filter_on_admin_list(self):
        verified = self._kyc(status=SellerKYC.Status.VERIFIED)
        SellerKYC.objects.create(
            seller=make_user("pending@sunu.test", Role.RoleName.MERCHANT),
            document_type="cni",
            document_front="kyc/sellers/2/f.jpg", document_back="kyc/sellers/2/b.jpg",
            status=SellerKYC.Status.PENDING,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/kyc/seller-kyc/", {"status": "VERIFIED"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], str(verified.id))

    def test_admin_retrieve_exposes_history_and_fraud_flags(self):
        kyc = self._kyc()
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/kyc/seller-kyc/{kyc.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("history", response.data)
        self.assertIn("fraud_flags", response.data)
        self.assertIsInstance(response.data["fraud_flags"], list)

    def test_own_dossier_never_leaks_history_or_fraud_flags(self):
        self._kyc()
        self.client.force_authenticate(self.merchant)
        response = self.client.get("/api/kyc/seller-kyc/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["history"], [])
        self.assertEqual(response.data["fraud_flags"], [])


@KYC_FS
class KYCReusedDocumentTests(TestCase):
    """Détection simple de fraude (spec §15) : un même document soumis à
    plusieurs comptes, un téléphone partagé → alertes réservées à l'admin."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.override_storage = override_settings(KYC_STORAGE_LOCATION=self.tmp)
        self.override_storage.enable()
        self.addCleanup(self.override_storage.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.merchant_a = make_user("fraud-a@sunu.test", Role.RoleName.MERCHANT)
        self.merchant_b = make_user("fraud-b@sunu.test", Role.RoleName.MERCHANT)
        self.admin = make_user("admin-fraud@sunu.test", Role.RoleName.ADMIN)
        self.client = APIClient()

    def _submit(self, user, doc_bytes, phone=None):
        self.client.force_authenticate(user)
        if phone:
            user.phone = phone
            user.save()
        return self.client.post(
            "/api/kyc/seller-kyc/submit/",
            {
                "document_type": "cni",
                "document_front": SimpleUploadedFile("front.jpg", doc_bytes, content_type="image/jpeg"),
                "document_back": SimpleUploadedFile("back.jpg", doc_bytes, content_type="image/jpeg"),
            },
            format="multipart",
        )

    def test_reused_document_is_flagged_for_admin(self):
        same_doc = b"\xff\xd8\xff\xe0" + b"A" * 512
        shared_phone = "+221771111111"
        self._submit(self.merchant_a, same_doc, phone=shared_phone)
        self._submit(self.merchant_b, same_doc, phone=shared_phone)

        kyc_b = SellerKYC.objects.get(seller=self.merchant_b)
        self.assertEqual(kyc_b.document_hash, SellerKYC.objects.get(seller=self.merchant_a).document_hash)

        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/kyc/seller-kyc/{kyc_b.id}/")
        flags = {f["code"] for f in response.data["fraud_flags"]}
        self.assertIn("document_reused", flags)
        self.assertIn("phone_reused", flags)

    def test_own_dossier_merchant_sees_no_flags(self):
        SellerKYC.objects.create(
            seller=self.merchant_a, document_type="cni",
            document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
            status=SellerKYC.Status.VERIFIED,
        )
        self.client.force_authenticate(self.merchant_a)
        response = self.client.get("/api/kyc/seller-kyc/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["fraud_flags"], [])


@KYC_FS
class KYCPublishGatingTests(TestCase):
    """Publication de produit et badge « vendeur vérifié » (spec §8, §9, §21) :
    un vendeur suspendu/bloqué ne peut plus publier, et la marketplace affiche
    le badge généré backend."""

    def setUp(self):
        self.merchant = make_user("pub@sunu.test", Role.RoleName.MERCHANT)
        self.client = APIClient()
        self.store = Store.objects.create(
            owner=self.merchant, name="Boutique de test", status=Store.Status.ACTIVE,
        )
        self.product = Product.objects.create(
            store=self.store, name="Produit de test", base_price=1500, status=Product.Status.DRAFT,
        )

    def _kyc(self, status):
        return SellerKYC.objects.create(
            seller=self.merchant, document_type="cni",
            document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
            status=status,
        )

    def _publish(self):
        self.client.force_authenticate(self.merchant)
        return self.client.patch(
            f"/api/catalog/products/{self.product.id}/", {"status": "active"}, format="json"
        )

    def test_verified_seller_can_publish_product(self):
        self._kyc(SellerKYC.Status.VERIFIED)
        response = self._publish()
        self.assertEqual(response.status_code, 200, response.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.ACTIVE)

    def test_seller_without_kyc_cannot_publish_after_store_approval(self):
        response = self._publish()
        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.DRAFT)

    def test_suspended_seller_cannot_publish_product(self):
        self._kyc(SellerKYC.Status.SUSPENDED)
        response = self._publish()
        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertEqual(self.product.status, Product.Status.DRAFT)

    def test_blocked_seller_cannot_publish_product(self):
        self._kyc(SellerKYC.Status.BLOCKED)
        response = self._publish()
        self.assertEqual(response.status_code, 403)

    def test_verified_badge_on_store_and_product(self):
        self._kyc(SellerKYC.Status.VERIFIED)
        store_response = self.client.get(f"/api/catalog/stores/{self.store.id}/")
        self.assertEqual(store_response.data["is_verified_seller"], True)

        self.product.status = Product.Status.ACTIVE
        self.product.save()
        product_response = self.client.get(f"/api/catalog/products/{self.product.id}/")
        self.assertEqual(product_response.data["store_is_verified"], True)

    def test_no_badge_when_not_verified(self):
        store_response = self.client.get(f"/api/catalog/stores/{self.store.id}/")
        self.assertEqual(store_response.data["is_verified_seller"], False)


@KYC_FS
class SellerSingleValidationTests(TestCase):
    """Une seule décision de l'administration pour le dossier vendeur :
    boutique et pièce d'identité sont validées ou refusées ensemble."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.override_storage = override_settings(KYC_STORAGE_LOCATION=self.tmp)
        self.override_storage.enable()
        self.addCleanup(self.override_storage.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.admin = make_user("admin@sunu.test", Role.RoleName.ADMIN)
        self.merchant = make_user("m@sunu.test", Role.RoleName.MERCHANT)
        self.client = APIClient()

    def _submit_kyc(self):
        self.client.force_authenticate(self.merchant)
        return self.client.post(
            "/api/kyc/seller-kyc/submit/",
            {"document_type": "cni", "document_front": cni_upload("f.jpg"), "document_back": cni_upload("b.jpg")},
            format="multipart",
        )

    def _create_store(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.post("/api/catalog/stores/", {"name": "Boutique test"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Store.objects.get(pk=response.data["id"])

    def _as_admin(self):
        self.client.force_authenticate(self.admin)

    def test_approval_activates_store_and_verifies_identity(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()

        response = self.client.post(f"/api/catalog/stores/{store.id}/approve/")

        self.assertEqual(response.status_code, 200, response.data)
        store.refresh_from_db()
        kyc = SellerKYC.objects.get(seller=self.merchant)
        self.assertEqual(store.status, Store.Status.ACTIVE)
        self.assertEqual(kyc.status, SellerKYC.Status.VERIFIED)
        self.assertTrue(VerificationHistory.objects.filter(kyc=kyc, new_status=SellerKYC.Status.VERIFIED,
                                                          reviewed_by=self.admin).exists())
        self.assertTrue(KYCAuditLog.objects.filter(kyc_id=str(kyc.id), action="ADMIN_APPROVE_SELLER_KYC").exists())
        self.assertTrue(Notification.objects.filter(user=self.merchant, subject__icontains="validé").exists())

    def test_approval_refused_without_pending_identity(self):
        store = Store.objects.create(owner=self.merchant, name="Ancienne boutique")
        self._as_admin()
        response = self.client.post(f"/api/catalog/stores/{store.id}/approve/")
        self.assertEqual(response.status_code, 400)
        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.INACTIVE)

    def test_admin_without_kyc_permission_cannot_decide(self):
        self._submit_kyc()
        store = self._create_store()
        self.client.force_authenticate(make_user("support@sunu.test", Role.RoleName.ADMIN_SUPPORT))
        self.assertEqual(self.client.post(f"/api/catalog/stores/{store.id}/approve/").status_code, 403)
        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.INACTIVE)

    def test_rejection_requires_a_reason(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()
        response = self.client.post(f"/api/catalog/stores/{store.id}/reject/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_rejection_sends_back_store_and_identity(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()

        response = self.client.post(f"/api/catalog/stores/{store.id}/reject/",
                                    {"reason": "Pièce floue"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        store.refresh_from_db()
        kyc = SellerKYC.objects.get(seller=self.merchant)
        self.assertTrue(store.is_rejected())
        self.assertEqual(kyc.status, SellerKYC.Status.REJECTED)
        self.assertEqual(kyc.rejection_reason, "Pièce floue")

    def test_store_only_rejection_keeps_identity_in_review(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()
        self.client.post(f"/api/catalog/stores/{store.id}/reject/",
                         {"reason": "Adresse incomplète", "identity_rejected": False}, format="json")
        self.assertEqual(SellerKYC.objects.get(seller=self.merchant).status, SellerKYC.Status.SUBMITTED)

    def test_new_identity_document_sends_rejected_dossier_back_to_review(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()
        self.client.post(f"/api/catalog/stores/{store.id}/reject/", {"reason": "Pièce floue"}, format="json")

        self.assertEqual(self._submit_kyc().status_code, 200)

        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.INACTIVE)
        self._as_admin()
        self.assertEqual(self.client.post(f"/api/catalog/stores/{store.id}/approve/").status_code, 200)

    def test_store_correction_sends_rejected_dossier_back_to_review(self):
        self._submit_kyc()
        store = self._create_store()
        self._as_admin()
        self.client.post(f"/api/catalog/stores/{store.id}/reject/",
                         {"reason": "Adresse incomplète", "identity_rejected": False}, format="json")

        self.client.force_authenticate(self.merchant)
        response = self.client.patch(f"/api/catalog/stores/{store.id}/",
                                     {"address": "12 rue Carnot, Dakar"}, format="json")

        self.assertEqual(response.status_code, 200, response.data)
        store.refresh_from_db()
        self.assertEqual(store.status, Store.Status.INACTIVE)


@KYC_FS
@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    ADMIN_NOTIFICATION_EMAIL="marketplace-admin@sunu.test",
)
class SellerOnboardingTests(TestCase):
    """Parcours vendeur : boutique, pièce d'identité, puis une validation qui
    met en ligne les brouillons et démarre l'essai gratuit."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.override_storage = override_settings(KYC_STORAGE_LOCATION=self.tmp)
        self.override_storage.enable()
        self.addCleanup(self.override_storage.disable)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

        self.admin = make_user("admin@sunu.test", Role.RoleName.ADMIN)
        self.merchant = make_user("m@sunu.test", Role.RoleName.MERCHANT)
        self.client = APIClient()

    def _create_store(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.post("/api/catalog/stores/", {"name": "Boutique test"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return Store.objects.get(pk=response.data["id"])

    def _submit_kyc(self):
        self.client.force_authenticate(self.merchant)
        response = self.client.post(
            "/api/kyc/seller-kyc/submit/",
            {"document_type": "cni", "document_front": cni_upload("f.jpg"), "document_back": cni_upload("b.jpg")},
            format="multipart",
        )
        self.assertIn(response.status_code, (200, 201), response.data)

    def _approve(self, store):
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/catalog/stores/{store.id}/approve/")
        self.assertEqual(response.status_code, 200, response.data)

    def _trial(self):
        self.client.force_authenticate(self.merchant)
        return self.client.get("/api/monetization/subscription/me/").data["trial"]

    def _admin_alerts(self):
        return [m for m in mail.outbox if m.to == ["marketplace-admin@sunu.test"]]

    def test_admin_is_alerted_once_the_dossier_is_complete(self):
        self._create_store()
        self.assertEqual(self._admin_alerts(), [])

        self._submit_kyc()
        self.assertEqual(len(self._admin_alerts()), 1)
        self.assertIn("Nouvelle boutique à valider", self._admin_alerts()[0].subject)

        # Renvoyer la pièce pendant l'examen ne relance pas l'alerte.
        self._submit_kyc()
        self.assertEqual(len(self._admin_alerts()), 1)

    def test_pending_seller_prepares_draft_products(self):
        store = self._create_store()
        self._submit_kyc()
        self.client.force_authenticate(self.merchant)
        response = self.client.post(
            "/api/catalog/products/",
            {"store": str(store.id), "name": "Robe wax", "base_price": 15000, "status": "draft"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_first_validation_publishes_drafts_and_starts_trial(self):
        store = self._create_store()
        self._submit_kyc()
        ready = Product.objects.create(store=store, name="Robe wax", base_price=15000, status=Product.Status.DRAFT)
        ProductVariant.objects.create(product=ready, sku="ROBE-1", price=15000)
        no_price = Product.objects.create(store=store, name="Sans prix", base_price=1000, status=Product.Status.DRAFT)
        self.assertEqual(self._trial()["status"], "pending")

        self._approve(store)

        ready.refresh_from_db()
        no_price.refresh_from_db()
        self.assertEqual(ready.status, Product.Status.ACTIVE)
        self.assertEqual(no_price.status, Product.Status.DRAFT)

        trial = self._trial()
        self.assertEqual(trial["status"], "active")
        self.assertEqual(trial["days_left"], settings.COMMISSION_TRIAL_DAYS)
        entitlement = SellerSubscription.objects.get(seller=self.merchant)
        self.assertAlmostEqual(
            entitlement.trial_ends_at, timezone.now() + timedelta(days=settings.COMMISSION_TRIAL_DAYS),
            delta=timedelta(minutes=1),
        )
        message = Notification.objects.get(user=self.merchant, subject__icontains="validé").message
        self.assertIn("Votre produit en brouillon est maintenant en ligne", message)
        self.assertIn("Votre essai gratuit commence aujourd'hui", message)

    def test_new_validation_does_not_restart_the_trial(self):
        store = self._create_store()
        self._submit_kyc()
        self._approve(store)
        entitlement = SellerSubscription.objects.get(seller=self.merchant)
        ends = timezone.now() + timedelta(days=5)
        entitlement.trial_ends_at = ends
        entitlement.save(update_fields=["trial_ends_at"])

        self.client.force_authenticate(self.admin)
        self.client.post(f"/api/catalog/stores/{store.id}/reject/", {"reason": "Logo flou"}, format="json")
        self.client.force_authenticate(self.merchant)
        self.client.patch(f"/api/catalog/stores/{store.id}/", {"name": "Boutique corrigée"}, format="json")
        self._approve(store)

        entitlement.refresh_from_db()
        self.assertEqual(entitlement.trial_ends_at, ends)

    def test_identity_verified_from_kyc_page_starts_trial(self):
        self._create_store()
        self._submit_kyc()
        kyc = SellerKYC.objects.get(seller=self.merchant)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f"/api/kyc/seller-kyc/{kyc.id}/approve/").status_code, 200)
        self.assertEqual(self._trial()["status"], "active")

    def test_already_verified_seller_without_entitlement_starts_now(self):
        SellerKYC.objects.create(
            seller=self.merchant, document_type="cni", status=SellerKYC.Status.VERIFIED,
            document_front="kyc/sellers/1/f.jpg", document_back="kyc/sellers/1/b.jpg",
        )
        entitlement = SellerSubscription.get_or_create_for(self.merchant)
        self.assertTrue(entitlement.trial_active())
        self.assertAlmostEqual(entitlement.trial_started_at, timezone.now(), delta=timedelta(minutes=1))

    def test_migration_resets_trials_of_sellers_not_yet_validated(self):
        migration = importlib.import_module("apps.commissions.migrations.0003_trial_starts_at_validation")
        started = timezone.now() - timedelta(days=10)
        waiting = SellerSubscription.objects.create(
            seller=self.merchant, trial_started_at=started, trial_ends_at=started + timedelta(days=30),
        )
        validated_seller = make_user("ok@sunu.test", Role.RoleName.MERCHANT)
        SellerKYC.objects.create(
            seller=validated_seller, document_type="cni", status=SellerKYC.Status.VERIFIED,
            document_front="kyc/sellers/2/f.jpg", document_back="kyc/sellers/2/b.jpg",
        )
        validated = SellerSubscription.objects.create(
            seller=validated_seller, trial_started_at=started, trial_ends_at=started + timedelta(days=30),
        )

        migration.reset_pending_trials(django_apps, None)

        waiting.refresh_from_db()
        validated.refresh_from_db()
        self.assertIsNone(waiting.trial_ends_at)
        self.assertTrue(waiting.trial_pending())
        self.assertEqual(validated.trial_started_at, started)
