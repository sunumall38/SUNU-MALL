"""Limites globales de requêtes sur l'API (apps/security/throttling.py)."""
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.users.models import User

URL = "/api/catalog/categories/"


@override_settings(API_ANON_THROTTLE_RATE="3/min", API_USER_THROTTLE_RATE="5/min")
class ApiThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client = APIClient()

    def _codes(self, count):
        return [self.client.get(URL).status_code for _ in range(count)]

    def test_visitor_is_limited(self):
        self.assertEqual(self._codes(4), [200, 200, 200, 429])

    def test_signed_in_user_has_own_limit(self):
        # La limite des visiteurs de la même adresse ne bloque pas un compte connecté.
        self._codes(3)
        user = User.objects.create_user(username="client", email="client@example.com", password="secret123")
        self.client.force_authenticate(user)
        self.assertEqual(self._codes(6), [200] * 5 + [429])

    @override_settings(API_ANON_THROTTLE_RATE=None, API_USER_THROTTLE_RATE=None)
    def test_no_limit_when_disabled(self):
        self.assertEqual(set(self._codes(10)), {200})
