"""L'email du propriétaire d'une boutique n'est jamais public."""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.models import Store
from apps.users.models import Role, User, UserRole


class StoreOwnerEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username="vendeur", email="vendeur@example.com", password="secret123")
        self.store = Store.objects.create(owner=self.owner, name="Boutique", status=Store.Status.ACTIVE)

    def _owner_email(self, user=None):
        self.client.force_authenticate(user)
        response = self.client.get(f"/api/catalog/stores/{self.store.id}/")
        self.assertEqual(response.status_code, 200)
        return response.json()["owner_email"]

    def test_hidden_from_visitors_and_other_clients(self):
        self.assertIsNone(self._owner_email())
        other = User.objects.create_user(username="client", email="client@example.com", password="secret123")
        self.assertIsNone(self._owner_email(other))

    def test_visible_to_owner_and_admin(self):
        self.assertEqual(self._owner_email(self.owner), "vendeur@example.com")
        admin = User.objects.create_user(username="admin", email="admin@example.com", password="secret123")
        role, _ = Role.objects.get_or_create(name=Role.RoleName.ADMIN)
        UserRole.objects.create(user=admin, role=role)
        self.assertEqual(self._owner_email(admin), "vendeur@example.com")
