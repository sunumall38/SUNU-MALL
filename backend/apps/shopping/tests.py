"""
Tests du panier et de la liste de souhaits : panier multi-boutiques, contrôle
du stock à l'ajout comme à la modification, isolation entre utilisateurs.
"""
from decimal import Decimal

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.catalog.models import Inventory, Product, ProductVariant, Store
from apps.shopping.models import Cart, CartItem
from apps.users.models import User

CART_URL = "/api/shopping/cart/"
CART_ITEMS_URL = "/api/shopping/cart/items/"
WISHLIST_URL = "/api/shopping/wishlist/"
WISHLIST_ITEMS_URL = "/api/shopping/wishlist/items/"


class CartTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = self._make_user("client@example.com")
        self.client.force_authenticate(self.customer)

        merchant = self._make_user("merchant@example.com")
        self.store = Store.objects.create(owner=merchant, name="Boutique A", status=Store.Status.ACTIVE)
        self.other_store = Store.objects.create(owner=merchant, name="Boutique B", status=Store.Status.ACTIVE)
        self.variant = self._make_variant(self.store, "SKU-A", Decimal("2500"), stock=5)
        self.other_variant = self._make_variant(self.other_store, "SKU-B", Decimal("1000"), stock=10)

    def _make_user(self, email):
        return User.objects.create_user(username=email, email=email, password="testpass123", is_verified=True)

    def _make_variant(self, store, sku, price, stock):
        product = Product.objects.create(
            store=store, name=f"Produit {sku}", base_price=price, status=Product.Status.ACTIVE,
        )
        variant = ProductVariant.objects.create(product=product, sku=sku, price=price)
        Inventory.objects.create(variant=variant, quantity=stock)
        return variant

    def _add(self, variant, quantity=1):
        return self.client.post(
            CART_ITEMS_URL, {"product_variant": str(variant.id), "quantity": quantity}, format="json",
        )

    def test_cart_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(CART_URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_empty_cart_is_created_on_first_read(self):
        response = self.client.get(CART_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["items"], [])
        self.assertTrue(Cart.objects.filter(user=self.customer).exists())

    def test_cart_holds_items_from_several_stores(self):
        self._add(self.variant, 2)
        response = self._add(self.other_variant, 3)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        stores = {item["store"] for item in response.data["items"]}
        self.assertEqual(stores, {str(self.store.id), str(self.other_store.id)})
        self.assertEqual(Decimal(str(response.data["total_price"])), Decimal("8000"))

    def test_adding_same_variant_twice_accumulates_quantity(self):
        self._add(self.variant, 2)
        self._add(self.variant, 1)
        item = CartItem.objects.get(cart__user=self.customer, product_variant=self.variant)
        self.assertEqual(item.quantity, 3)

    def test_adding_beyond_stock_is_refused(self):
        self._add(self.variant, 4)
        response = self._add(self.variant, 2)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        item = CartItem.objects.get(cart__user=self.customer, product_variant=self.variant)
        self.assertEqual(item.quantity, 4)

    def test_reserved_stock_is_not_available(self):
        Inventory.objects.filter(variant=self.variant).update(reserved_quantity=4)
        self.assertEqual(self._add(self.variant, 2).status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_quantity_is_refused(self):
        for quantity in (0, -1, "abc"):
            with self.subTest(quantity=quantity):
                self.assertEqual(self._add(self.variant, quantity).status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CartItem.objects.exists())

    def test_quantity_update_respects_stock(self):
        item_id = self._add(self.variant, 1).data["items"][0]["id"]
        url = f"{CART_ITEMS_URL}{item_id}/"

        ok = self.client.patch(url, {"quantity": 5}, format="json")
        self.assertEqual(ok.status_code, status.HTTP_200_OK)

        too_many = self.client.patch(url, {"quantity": 6}, format="json")
        self.assertEqual(too_many.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(CartItem.objects.get(pk=item_id).quantity, 5)

    def test_item_can_be_removed_and_cart_cleared(self):
        item_id = self._add(self.variant).data["items"][0]["id"]
        self._add(self.other_variant)

        removed = self.client.delete(f"{CART_ITEMS_URL}{item_id}/")
        self.assertEqual(len(removed.data["items"]), 1)

        cleared = self.client.post(f"{CART_URL}clear/")
        self.assertEqual(cleared.data["items"], [])

    def test_user_cannot_touch_another_users_cart_item(self):
        item_id = self._add(self.variant).data["items"][0]["id"]
        self.client.force_authenticate(self._make_user("intrus@example.com"))

        self.assertEqual(
            self.client.patch(f"{CART_ITEMS_URL}{item_id}/", {"quantity": 2}, format="json").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(self.client.delete(f"{CART_ITEMS_URL}{item_id}/").status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(CartItem.objects.get(pk=item_id).quantity, 1)


class WishlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = User.objects.create_user(
            username="client@example.com", email="client@example.com", password="testpass123", is_verified=True,
        )
        merchant = User.objects.create_user(
            username="merchant@example.com", email="merchant@example.com", password="testpass123",
        )
        store = Store.objects.create(owner=merchant, name="Boutique", status=Store.Status.ACTIVE)
        self.product = Product.objects.create(
            store=store, name="Produit", base_price=Decimal("1500"), status=Product.Status.ACTIVE,
        )
        self.client.force_authenticate(self.customer)

    def test_add_is_idempotent_and_remove_works(self):
        self.client.post(WISHLIST_ITEMS_URL, {"product": str(self.product.id)}, format="json")
        response = self.client.post(WISHLIST_ITEMS_URL, {"product": str(self.product.id)}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(response.data["items"]), 1)

        removed = self.client.delete(f"{WISHLIST_ITEMS_URL}{self.product.id}/")
        self.assertEqual(removed.data["items"], [])

    def test_wishlist_requires_authentication(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(WISHLIST_URL).status_code, status.HTTP_401_UNAUTHORIZED)
