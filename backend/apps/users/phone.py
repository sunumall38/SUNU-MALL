import re

from django.core.exceptions import ValidationError


SENEGAL_COUNTRY_CODE = "221"


def normalize_senegal_phone(value: str) -> str:
    """Retourne un numéro sénégalais au format E.164 (+221XXXXXXXXX).

    Les espaces, tirets et parenthèses sont acceptés. Les formes locales
    (77 123 45 67), internationales (221771234567 / +221771234567) et le
    préfixe 00 (00221771234567) sont prises en charge.
    """
    raw = (value or "").strip()
    digits = re.sub(r"\D", "", raw)

    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith(SENEGAL_COUNTRY_CODE):
        digits = digits[len(SENEGAL_COUNTRY_CODE) :]
    elif len(digits) == 10 and digits.startswith("0"):
        digits = digits[1:]

    if len(digits) != 9:
        raise ValidationError(
            "Saisissez un numéro sénégalais valide, par exemple +221 77 123 45 67."
        )

    return f"+{SENEGAL_COUNTRY_CODE}{digits}"
