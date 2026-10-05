"""
Tests des rapports administrateur (apps/reports).

Le stockage par défaut est remplacé par un stockage local temporaire pour
que la suite s'exécute sans MinIO. Couvre : la permission admin, les erreurs
(type/format inconnus) et la génération CSV/PDF (URL + nom de fichier).
"""
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from rest_framework.test import APIClient

from apps.users.models import Role, UserRole

User = get_user_model()

_TMP_STORAGE = {"location": tempfile.mkdtemp(prefix="sunu-reports-")}


@override_settings(STORAGES={
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": _TMP_STORAGE,
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
})
class ReportsTestCase(TestCase):
    def setUp(self):
        Role.objects.get_or_create(name=Role.RoleName.ADMIN)
        Role.objects.get_or_create(name=Role.RoleName.CLIENT)
        self.client = APIClient()
        self.admin = self.create_user("admin@example.com", Role.RoleName.ADMIN)
        self.customer = self.create_user("client@example.com", Role.RoleName.CLIENT)

    def create_user(self, email, role_name):
        user = User.objects.create_user(
            username=email, email=email, password="testpass123", is_verified=True
        )
        role = Role.objects.get(name=role_name)
        UserRole.objects.create(user=user, role=role)
        return user

    def test_reports_require_admin(self):
        self.client.force_authenticate(user=self.customer)
        resp = self.client.get("/api/reports/global/?fmt=csv")
        self.assertEqual(resp.status_code, 403)

    def test_unknown_report_type_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/reports/inexistant/?fmt=csv")
        self.assertEqual(resp.status_code, 404)

    def test_invalid_format_returns_400(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/reports/global/?fmt=xlsx")
        self.assertEqual(resp.status_code, 400)

    def test_global_csv_report(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/reports/global/?fmt=csv")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment;", resp["Content-Disposition"])
        self.assertTrue(resp["Content-Disposition"].endswith('.csv"'))
        self.assertEqual(resp["Cache-Control"], "no-store")
        self.assertIn("SUNU MALL", resp.content.decode("utf-8-sig"))

    def test_finance_pdf_report(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/reports/finance/?fmt=pdf")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp["Content-Type"], "application/pdf")
        self.assertTrue(resp["Content-Disposition"].endswith('.pdf"'))
        self.assertTrue(resp.content.startswith(b"%PDF"))

    def test_report_is_not_written_to_media_storage(self):
        """Le rapport part dans la réponse, jamais dans le bucket média."""
        self.client.force_authenticate(user=self.admin)
        self.client.get("/api/reports/finance/?fmt=csv")
        self.assertFalse((Path(_TMP_STORAGE["location"]) / "reports").exists())

    def test_admin_without_export_permission_is_refused(self):
        """Un admin spécialisé sans `reports.export` (ex. KYC) n'exporte rien."""
        Role.objects.get_or_create(name=Role.RoleName.ADMIN_KYC)
        kyc_admin = self.create_user("kyc@example.com", Role.RoleName.ADMIN_KYC)
        self.client.force_authenticate(user=kyc_admin)
        resp = self.client.get("/api/reports/finance/?fmt=csv")
        self.assertEqual(resp.status_code, 403)

    def test_export_is_recorded_in_admin_audit_log(self):
        from apps.security.models import AdminAuditLog

        self.client.force_authenticate(user=self.admin)
        self.client.get("/api/reports/kyc/?fmt=csv")
        self.assertTrue(AdminAuditLog.objects.filter(object_type="report", object_id="kyc").exists())


class CsvFormulaInjectionTests(TestCase):
    def test_user_text_starting_like_a_formula_is_neutralised(self):
        from .generators import render_csv

        report = {"title": "Test", "sections": [{
            "heading": "Boutiques",
            "kpis": [("Total", 2)],
            "table": {"columns": ["Nom", "Solde"], "rows": [
                ['=HYPERLINK("http://evil.example","Clique")', -1500],
                ["@SUM(A1:A9)", "-2 500,50"],
                ["Boutique normale", "+221 77 000 00 00"],
            ]},
        }]}
        text = render_csv(report).decode("utf-8-sig")
        self.assertIn("'=HYPERLINK", text)
        self.assertIn("'@SUM", text)
        self.assertIn("'+221 77", text)
        # Les nombres négatifs restent des nombres.
        self.assertIn(",-1500", text)
        self.assertIn("-2 500,50", text)
        self.assertNotIn("'-2 500", text)
