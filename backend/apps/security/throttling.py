"""
Limites globales de requêtes sur l'API.

Un seul processus sert l'API : sans limite, un robot ou un client mal écrit
pourrait l'occuper à lui seul. Les taux sont larges (une navigation normale
reste très en dessous) et réglables par variables d'environnement
(API_ANON_THROTTLE_RATE, API_USER_THROTTLE_RATE) ; config/settings/dev.py les
désactive (None) pour le dev et les tests.
"""
from django.conf import settings
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class _RateFromSettings:
    """Lit le taux dans les settings à chaque requête, pas une fois au chargement."""

    rate_setting = ""

    def get_rate(self):
        return getattr(settings, self.rate_setting)


class ApiAnonThrottle(_RateFromSettings, AnonRateThrottle):
    """Visiteurs non connectés, comptés par adresse."""

    scope = "api_anon"
    rate_setting = "API_ANON_THROTTLE_RATE"


class ApiUserThrottle(_RateFromSettings, UserRateThrottle):
    """Comptes connectés, comptés par compte (impossible à contourner en
    changeant d'adresse). Les visiteurs relèvent d'ApiAnonThrottle."""

    scope = "api_user"
    rate_setting = "API_USER_THROTTLE_RATE"

    def get_cache_key(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return None
        return super().get_cache_key(request, view)
