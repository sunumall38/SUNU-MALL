from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("orders", "0010_deliverytracking_ordering_tiebreak"),
    ]

    operations = [
        migrations.AddField(
            model_name="order",
            name="ready_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
