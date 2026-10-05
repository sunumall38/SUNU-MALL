import re

from django.db import migrations


def normalize_existing_phones(apps, schema_editor):
    User = apps.get_model("users", "User")
    for user in User.objects.exclude(phone="").iterator():
        digits = re.sub(r"\D", "", user.phone or "")
        if digits.startswith("00"):
            digits = digits[2:]
        if digits.startswith("221"):
            digits = digits[3:]
        elif len(digits) == 10 and digits.startswith("0"):
            digits = digits[1:]
        if len(digits) == 9:
            normalized = f"+221{digits}"
            if user.phone != normalized:
                User.objects.filter(pk=user.pk).update(phone=normalized)


class Migration(migrations.Migration):
    dependencies = [("users", "0007_token_guest_login_type")]
    operations = [
        migrations.RunPython(normalize_existing_phones, migrations.RunPython.noop)
    ]
