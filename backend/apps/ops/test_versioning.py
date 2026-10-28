"""Version publiée : fichier VERSION, endpoint public, historique des déploiements."""
import json
from pathlib import Path

from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.ops.models import DeploymentVersion

REPO_ROOT = Path(__file__).resolve().parents[3]


class VersioningTests(TestCase):
    def test_version_file_matches_frontend_package(self):
        version = (REPO_ROOT / "VERSION").read_text().strip()
        package = json.loads((REPO_ROOT / "frontend" / "package.json").read_text())
        self.assertRegex(version, r"^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$")
        self.assertEqual(package["version"], version)

    @override_settings(APP_VERSION="1.2.3", APP_COMMIT="abcdef1234567890")
    def test_version_endpoint_is_public(self):
        response = APIClient().get("/api/version/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"version": "1.2.3", "commit": "abcdef123456"})

    def test_record_deployment_is_idempotent_and_single_active(self):
        with override_settings(APP_VERSION="1.0.0", APP_COMMIT="aaa"):
            call_command("record_deployment")
            call_command("record_deployment")
        self.assertEqual(DeploymentVersion.objects.count(), 1)
        with override_settings(APP_VERSION="1.0.1", APP_COMMIT="bbb"):
            call_command("record_deployment")
        active = DeploymentVersion.objects.filter(is_active=True)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.get().version, "1.0.1")
