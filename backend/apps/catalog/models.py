"""
Catalogue : magasins, catégories, marques, produits, variants, inventaire et avis.
"""
import uuid
from django.db import models
from django.utils import timezone
from apps.users.models import User


class StoreCategory(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Store(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        SUSPENDED = 'suspended', 'Suspended'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='stores')
    category = models.ForeignKey(StoreCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='stores')
    name = models.CharField(max_length=255)
    # Informations soumises à la création, pour que l'admin ait de quoi
    # évaluer une demande à l'approbation (avant ça : uniquement le nom).
    phone = models.CharField(max_length=20, blank=True)
    description = models.TextField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    # Raison du dernier rejet, affichée au commerçant — sans ça, la raison
    # n'existait que dans le corps de l'email envoyé, jamais consultable
    # depuis le tableau de bord lui-même.
    rejection_reason = models.TextField(blank=True)
    logo = models.ImageField(upload_to='stores/', blank=True, null=True)
    banner = models.ImageField(upload_to='stores/banners/', blank=True, null=True)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.INACTIVE)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def get_active_products(self):
        return self.products.filter(status='active')

    def calculate_rating(self):
        reviews = Review.objects.filter(product__store=self)
        if reviews.exists():
            return sum(review.rating for review in reviews) / reviews.count()
        return 0

    def __str__(self):
        return self.name


class StoreEmployee(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='employees')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='store_employments')
    role = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.get_full_name()} at {self.store.name}"


class StoreSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='settings')
    business_hours = models.JSONField(default=dict)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def is_open_now(self):
        # Simplified check, business_hours should have appropriate structure
        return True

    def __str__(self):
        return f"Settings for {self.store.name}"


class Category(models.Model):
    id = models.AutoField(primary_key=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    name = models.CharField(max_length=255)
    image = models.ImageField(upload_to='categories/', blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['name']

    def get_children(self):
        return self.children.all()

    def get_breadcrumb(self):
        breadcrumb = [self]
        current = self.parent
        while current:
            breadcrumb.insert(0, current)
            current = current.parent
        return breadcrumb

    def __str__(self):
        return self.name


class Brand(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    logo_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Product(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='products')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, null=True, blank=True, related_name='products')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def get_primary_image(self):
        return self.images.order_by('position').first()

    def is_in_stock(self):
        return any(variant.inventory.available() > 0 for variant in self.variants.all() if hasattr(variant, 'inventory'))

    def average_rating(self):
        reviews = self.reviews.all()
        if reviews.exists():
            return sum(review.rating for review in reviews) / reviews.count()
        return 0

    def __str__(self):
        return self.name


class ProductImage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    minio_path = models.CharField(max_length=255, blank=True)
    position = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['position']

    def get_store(self):
        return self.product.store

    def get_signed_url(self):
        return self.image.url if self.image else self.minio_path

    def __str__(self):
        return f"Image for {self.product.name}"


class ProductVariant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='variants')
    sku = models.CharField(max_length=100, unique=True)
    attributes = models.JSONField(default=dict)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def get_store(self):
        return self.product.store

    def get_price(self):
        return self.price

    def is_available(self):
        return hasattr(self, 'inventory') and self.inventory.available() > 0

    def __str__(self):
        return f"{self.product.name} - {self.sku}"


class Inventory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    variant = models.OneToOneField(ProductVariant, on_delete=models.CASCADE, related_name='inventory')
    quantity = models.IntegerField(default=0)
    reserved_quantity = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def reserve(self, qty):
        """Réserve `qty` unités, en une seule requête conditionnelle.

        La vérification du stock et l'incrément se font dans le même UPDATE :
        deux acheteurs simultanés ne peuvent jamais prendre le dernier
        article tous les deux.
        """
        qty = int(qty)
        if qty <= 0:
            return False
        updated = Inventory.objects.filter(
            pk=self.pk, quantity__gte=models.F("reserved_quantity") + qty,
        ).update(reserved_quantity=models.F("reserved_quantity") + qty, updated_at=timezone.now())
        self.refresh_from_db(fields=["quantity", "reserved_quantity"])
        return updated == 1

    def release(self, qty):
        """Rend `qty` unités réservées (annulation, commande non payée)."""
        from django.db.models.functions import Greatest

        Inventory.objects.filter(pk=self.pk).update(
            reserved_quantity=Greatest(models.F("reserved_quantity") - int(qty), 0),
            updated_at=timezone.now(),
        )
        self.refresh_from_db(fields=["quantity", "reserved_quantity"])

    def available(self):
        return self.quantity - self.reserved_quantity

    def __str__(self):
        return f"Inventory for {self.variant.sku}"


class Review(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField(choices=[(i, i) for i in range(1, 6)])
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['product', 'user']

    def __str__(self):
        return f"Review by {self.user.get_full_name()} for {self.product.name}"
