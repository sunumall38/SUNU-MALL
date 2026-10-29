"""
Tests "fumée" (smoke tests) : juste vérifier que les pièces de base
fonctionnent. Chaque équipe ajoutera ses propres tests dans
apps/<son_app>/tests.py au fur et à mesure du backlog réel.
"""
import pytest
from apps.catalog.models import Store
from apps.kyc.models import SellerKYC
from apps.monetization.models import Notification
from apps.users.models import Role, User, UserRole


@pytest.mark.django_db
def test_admin_accessible(client):
    response = client.get("/admin/login/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_products_list_is_public(client):
    """Le catalogue doit être consultable sans connexion (comme Amazon)."""
    response = client.get("/api/catalog/products/")
    assert response.status_code == 200


@pytest.mark.django_db
def test_admin_dashboard_stats_returns_counts(client):
    admin_user = User.objects.create_user(
        username="admin-dashboard",
        email="admin-dashboard@example.com",
        password="secret123",
        first_name="Admin",
        last_name="Dashboard",
    )
    admin_role, _ = Role.objects.get_or_create(
        name=Role.RoleName.ADMIN,
        defaults={"description": "Administrateur"},
    )
    UserRole.objects.get_or_create(user=admin_user, role=admin_role)

    owner = User.objects.create_user(
        username="store-owner",
        email="store-owner@example.com",
        password="secret123",
        first_name="Store",
        last_name="Owner",
    )
    Store.objects.create(owner=owner, name="Boutique A", status=Store.Status.ACTIVE)
    Store.objects.create(owner=owner, name="Boutique B", status=Store.Status.INACTIVE)
    Store.objects.create(owner=owner, name="Boutique C", status=Store.Status.SUSPENDED)

    client.force_login(admin_user)
    response = client.get("/api/users/admin/dashboard/stats/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["users"]["total"] >= 2
    assert payload["stores"]["active"] == 1
    assert payload["stores"]["pending_review"] == 1
    assert payload["stores"]["suspended"] == 1


@pytest.mark.django_db
def test_admin_can_approve_store(client):
    admin_user = User.objects.create_user(
        username="admin-store-approve",
        email="admin-store-approve@example.com",
        password="secret123",
        first_name="Admin",
        last_name="Approve",
    )
    admin_role, _ = Role.objects.get_or_create(name=Role.RoleName.ADMIN)
    UserRole.objects.get_or_create(user=admin_user, role=admin_role)

    owner = User.objects.create_user(
        username="owner-approve",
        email="owner-approve@example.com",
        password="secret123",
        first_name="Store",
        last_name="Owner",
    )
    store = Store.objects.create(owner=owner, name="Boutique Approve", status=Store.Status.INACTIVE)
    kyc = SellerKYC.objects.create(
        seller=owner, document_type="cni", document_front="f.jpg", document_back="b.jpg",
        status=SellerKYC.Status.SUBMITTED,
    )

    client.force_login(admin_user)
    response = client.post(f"/api/catalog/stores/{store.id}/approve/")

    assert response.status_code == 200
    store.refresh_from_db()
    kyc.refresh_from_db()
    assert store.status == Store.Status.ACTIVE
    assert kyc.status == SellerKYC.Status.VERIFIED
    notification = Notification.objects.filter(user=owner, metadata__store_id=str(store.id)).first()
    assert notification is not None
    assert "validé" in notification.subject.lower()


@pytest.mark.django_db
def test_admin_can_reject_store(client):
    admin_user = User.objects.create_user(
        username="admin-store-reject",
        email="admin-store-reject@example.com",
        password="secret123",
        first_name="Admin",
        last_name="Reject",
    )
    admin_role, _ = Role.objects.get_or_create(name=Role.RoleName.ADMIN)
    UserRole.objects.get_or_create(user=admin_user, role=admin_role)

    owner = User.objects.create_user(
        username="owner-reject",
        email="owner-reject@example.com",
        password="secret123",
        first_name="Store",
        last_name="Owner",
    )
    store = Store.objects.create(owner=owner, name="Boutique Reject", status=Store.Status.INACTIVE)

    client.force_login(admin_user)
    response = client.post(
        f"/api/catalog/stores/{store.id}/reject/",
        data={"reason": "Données manquantes"},
        content_type="application/json"
    )

    assert response.status_code == 200
    store.refresh_from_db()
    assert store.status == Store.Status.SUSPENDED
    assert store.rejection_reason == "Données manquantes"
    notification = Notification.objects.filter(user=owner, metadata__store_id=str(store.id)).first()
    assert notification is not None
    assert "corriger" in notification.subject.lower()
