"""
Authentification de l'API avec mot de passe provisoire imposé.

Un compte créé par un tiers (livreur, partenaire) reçoit un mot de passe
provisoire et `must_change_password=True`. Tant qu'il n'est pas changé, le
compte ne peut appeler que les routes nécessaires pour le changer ou se
déconnecter : le contrôle se fait ici, côté serveur, et non seulement dans le
frontend. Sans cela, quiconque a vu le mot de passe provisoire (administrateur,
message relayé) utiliserait librement le compte, par exemple pour changer les
coordonnées de versement d'un partenaire avant sa première connexion.
"""
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

#: Routes (noms d'URL) ouvertes à un compte au mot de passe provisoire.
PASSWORD_CHANGE_ALLOWED_URL_NAMES = frozenset({
    "auth_change_password",
    "auth_logout",
    "token_refresh",
    "token_verify",
    "token_blacklist",
})

PASSWORD_CHANGE_REQUIRED_MESSAGE = (
    "Changez d'abord le mot de passe provisoire de votre compte."
)


def enforce_password_change(request, user):
    """Lève 403 si `user` doit encore changer son mot de passe provisoire."""
    if not getattr(user, "must_change_password", False):
        return
    match = getattr(getattr(request, "_request", request), "resolver_match", None)
    if match is not None and match.url_name in PASSWORD_CHANGE_ALLOWED_URL_NAMES:
        return
    raise PermissionDenied({
        "error": PASSWORD_CHANGE_REQUIRED_MESSAGE,
        "code": "password_change_required",
    })


class PasswordChangeEnforcingJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            enforce_password_change(request, result[0])
        return result


class PasswordChangeEnforcingSessionAuthentication(SessionAuthentication):
    def authenticate(self, request):
        result = super().authenticate(request)
        if result is not None:
            enforce_password_change(request, result[0])
        return result
