from django.apps import AppConfig


class AuthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.auth'
    label = 'backend_auth'

    def ready(self):
        # Enregistre les extensions OpenAPI des classes d'authentification.
        from . import schema  # noqa: F401
