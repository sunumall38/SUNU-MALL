"""
Garde-fous de configuration pour la production.

`config.settings.prod` appelle `validate_production_settings` au démarrage :
une configuration dangereuse fait échouer le lancement avec un message clair,
au lieu de tourner silencieusement dans un état exploitable.

La fonction est pure (elle ne lit que le dictionnaire reçu) pour rester
testable sans recharger les settings Django.
"""
from django.core.exceptions import ImproperlyConfigured

# Valeurs par défaut de config/settings/base.py, connues de tous (dépôt public).
DEFAULT_SECRETS = {
    "POSTGRES_PASSWORD": "sunu_mall",
    "MINIO_ACCESS_KEY": "minioadmin",
    "MINIO_SECRET_KEY": "minioadmin",
}


def _real_payment_credentials(settings):
    """Noms des identifiants marchands réels renseignés (liste vide si aucun)."""
    names = (
        "WAVE_API_KEY",
        "ORANGE_MONEY_CLIENT_ID",
        "ORANGE_MONEY_CLIENT_SECRET",
        "ORANGE_MONEY_MERCHANT_KEY",
    )
    return [name for name in names if settings.get(name)]


def validate_production_settings(settings):
    """Lève ImproperlyConfigured si la configuration de production est dangereuse."""
    sandbox = bool(settings.get("PAYMENT_SANDBOX"))
    credentials = _real_payment_credentials(settings)

    # 1. Sandbox + vraies clés marchandes : en mode sandbox, un client valide
    #    lui-même son paiement (action « sandbox-confirm ») et le webhook
    #    accepte toute notification sans signature. Acceptable tant que la
    #    plateforme est en démonstration, jamais une fois les vrais moyens de
    #    paiement branchés.
    if sandbox and credentials:
        raise ImproperlyConfigured(
            "PAYMENT_SANDBOX=True est incompatible avec des identifiants de paiement "
            f"réels ({', '.join(credentials)}). Passez PAYMENT_SANDBOX à False avant "
            "d'ouvrir les paiements : en mode sandbox, une commande peut être marquée "
            "payée sans aucun paiement."
        )

    # 2. Wave réel sans secret de webhook : toutes les notifications seraient
    #    rejetées et aucune commande ne passerait jamais à « payée ».
    if not sandbox and settings.get("WAVE_API_KEY"):
        wave_secret = (settings.get("PAYMENT_PROVIDERS") or {}).get("wave")
        if not wave_secret:
            raise ImproperlyConfigured(
                "WAVE_WEBHOOK_SECRET est obligatoire quand WAVE_API_KEY est renseignée : "
                "sans lui, la signature des notifications Wave ne peut pas être vérifiée."
            )

    # 3. Secrets laissés à leur valeur par défaut (publique).
    database = (settings.get("DATABASES") or {}).get("default", {})
    if database.get("PASSWORD") == DEFAULT_SECRETS["POSTGRES_PASSWORD"]:
        raise ImproperlyConfigured(
            "Le mot de passe PostgreSQL est encore la valeur par défaut du dépôt. "
            "Renseignez POSTGRES_PASSWORD (ou DATABASE_URL) avec un vrai secret."
        )
    if (
        settings.get("AWS_ACCESS_KEY_ID") == DEFAULT_SECRETS["MINIO_ACCESS_KEY"]
        or settings.get("AWS_SECRET_ACCESS_KEY") == DEFAULT_SECRETS["MINIO_SECRET_KEY"]
    ):
        raise ImproperlyConfigured(
            "Les identifiants du stockage de fichiers sont encore « minioadmin ». "
            "Renseignez MINIO_ACCESS_KEY et MINIO_SECRET_KEY avec de vrais secrets."
        )
