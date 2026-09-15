from django.db import migrations


CATEGORY_TREE = {
    "Électronique": ["Téléphones", "Informatique", "TV & Audio"],
    "Mode": ["Vêtements", "Chaussures", "Accessoires"],
    "Maison & Jardin": ["Meubles", "Décoration", "Électroménager"],
    "Beauté & Santé": ["Soins", "Parfums"],
    "Alimentation": ["Épicerie", "Boissons"],
    "Sports & Loisirs": ["Sport", "Jeux & Jouets"],
}


def seed_product_categories(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for parent_name, child_names in CATEGORY_TREE.items():
        parent, _ = Category.objects.get_or_create(parent=None, name=parent_name)
        for child_name in child_names:
            Category.objects.get_or_create(parent=parent, name=child_name)


def remove_seeded_product_categories(apps, schema_editor):
    Category = apps.get_model("catalog", "Category")
    for parent_name, child_names in CATEGORY_TREE.items():
        parents = Category.objects.filter(parent=None, name=parent_name)
        Category.objects.filter(parent__in=parents, name__in=child_names).delete()
        parents.filter(products__isnull=True, children__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [("catalog", "0009_seed_store_categories")]

    operations = [migrations.RunPython(seed_product_categories, remove_seeded_product_categories)]
