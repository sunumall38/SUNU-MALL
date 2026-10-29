"""
Documentation OpenAPI (drf-spectacular) des classes d'authentification.

Les classes de `apps.auth.authentication` héritent de JWT et de la session :
sans ces extensions, le schéma ne les reconnaît pas (« could not resolve
authenticator ») et Swagger perd le bouton d'authentification Bearer.
"""
from drf_spectacular.authentication import SessionScheme
from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme


class PasswordChangeEnforcingJWTScheme(SimpleJWTScheme):
    target_class = "apps.auth.authentication.PasswordChangeEnforcingJWTAuthentication"


class PasswordChangeEnforcingSessionScheme(SessionScheme):
    target_class = "apps.auth.authentication.PasswordChangeEnforcingSessionAuthentication"
