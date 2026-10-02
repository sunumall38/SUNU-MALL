"""Garde-fous de configuration de production (audit sécurité, faille C1)."""
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from config.settings.checks import validate_production_settings


def production_settings(**overrides):
    """Configuration de production saine, à dégrader champ par champ."""
    settings = {
        "PAYMENT_SANDBOX": False,
        "WAVE_API_KEY": "",
        "ORANGE_MONEY_CLIENT_ID": "",
        "ORANGE_MONEY_CLIENT_SECRET": "",
        "ORANGE_MONEY_MERCHANT_KEY": "",
        "PAYMENT_PROVIDERS": {"wave": "", "orange_money": ""},
        "DATABASES": {"default": {"PASSWORD": "un-vrai-secret"}},
        "AWS_ACCESS_KEY_ID": "cle-acces",
        "AWS_SECRET_ACCESS_KEY": "cle-secrete",
    }
    settings.update(overrides)
    return settings


class ProductionSettingsGuardTests(SimpleTestCase):
    def test_healthy_configuration_is_accepted(self):
        validate_production_settings(production_settings())

    def test_sandbox_alone_is_tolerated_for_the_demo_phase(self):
        validate_production_settings(production_settings(PAYMENT_SANDBOX=True))

    def test_sandbox_with_real_wave_key_is_refused(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "PAYMENT_SANDBOX"):
            validate_production_settings(
                production_settings(PAYMENT_SANDBOX=True, WAVE_API_KEY="wave_sn_prod_xxx")
            )

    def test_sandbox_with_real_orange_money_key_is_refused(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "ORANGE_MONEY_MERCHANT_KEY"):
            validate_production_settings(
                production_settings(PAYMENT_SANDBOX=True, ORANGE_MONEY_MERCHANT_KEY="xxx")
            )

    def test_real_wave_key_requires_webhook_secret(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "WAVE_WEBHOOK_SECRET"):
            validate_production_settings(production_settings(WAVE_API_KEY="wave_sn_prod_xxx"))
        validate_production_settings(production_settings(
            WAVE_API_KEY="wave_sn_prod_xxx",
            PAYMENT_PROVIDERS={"wave": "whsec_xxx", "orange_money": ""},
        ))

    def test_default_database_password_is_refused(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "PostgreSQL"):
            validate_production_settings(
                production_settings(DATABASES={"default": {"PASSWORD": "sunu_mall"}})
            )

    def test_default_storage_credentials_are_refused(self):
        with self.assertRaisesMessage(ImproperlyConfigured, "minioadmin"):
            validate_production_settings(production_settings(AWS_SECRET_ACCESS_KEY="minioadmin"))
