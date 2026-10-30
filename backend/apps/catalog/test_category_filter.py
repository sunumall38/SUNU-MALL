"""
Filtre par catégorie : les pages clients n'affichent que les catégories
principales, donc un produit classé dans une sous-catégorie doit y apparaître.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.catalog.models import Category, Product, Store
from apps.users.models import User


class CategoryFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        owner = User.objects.create_user(username="vendeur", email="vendeur@example.com", password="secret123")
        self.store = Store.objects.create(owner=owner, name="Boutique mode", status=Store.Status.ACTIVE)
        self.mode = Category.objects.create(name="Mode")
        self.shoes = Category.objects.create(name="Chaussures", parent=self.mode)
        self.food = Category.objects.create(name="Alimentation")
        self.dress = Product.objects.create(
            store=self.store, category=self.mode, name="Robe", base_price=5000, status=Product.Status.ACTIVE
        )
        self.sneakers = Product.objects.create(
            store=self.store, category=self.shoes, name="Baskets", base_price=15000, status=Product.Status.ACTIVE
        )

    def _product_names(self, category_id):
        response = self.client.get(f"/api/catalog/products/?category={category_id}")
        self.assertEqual(response.status_code, 200)
        return {product["name"] for product in response.json()["results"]}

    def test_main_category_includes_its_subcategories(self):
        self.assertEqual(self._product_names(self.mode.id), {"Robe", "Baskets"})

    def test_subcategory_lists_only_its_products(self):
        self.assertEqual(self._product_names(self.shoes.id), {"Baskets"})

    def test_other_category_is_empty(self):
        self.assertEqual(self._product_names(self.food.id), set())

    def test_invalid_category_is_rejected(self):
        response = self.client.get("/api/catalog/products/?category=abc")
        self.assertEqual(response.status_code, 400)

    def test_stores_by_category_include_subcategory_products(self):
        Product.objects.filter(pk=self.dress.pk).delete()
        response = self.client.get(f"/api/catalog/stores/?product_category={self.mode.id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([store["name"] for store in response.json()["results"]], ["Boutique mode"])
