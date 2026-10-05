from datetime import timedelta
from django.db import models
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import User, Role, Permission, UserRole, RolePermission
from .serializers import (
    UserSerializer, RoleSerializer, PermissionSerializer,
    UserRoleSerializer, RolePermissionSerializer
)
from .permissions import IsAdmin, IsSuperAdmin
from apps.catalog.models import Store


def _daily_counts(queryset, days=14):
    """
    Nombre de lignes par jour sur les `days` derniers jours, agrégé en
    base (TruncDate + Count) — pas de pagination à contourner, pas de
    liste tronquée récupérée côté client pour la re-découper en tas.
    """
    today = timezone.now().date()
    start = today - timedelta(days=days - 1)
    counts_by_date = {
        row["day"]: row["count"]
        for row in (
            queryset.filter(created_at__date__gte=start)
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=models.Count("id"))
            .values("day", "count")
        )
    }
    result = []
    for i in range(days):
        day = start + timedelta(days=i)
        result.append({"date": day.isoformat(), "count": counts_by_date.get(day, 0)})
    return result


class UserViewSet(viewsets.ModelViewSet):
    """
    CRUD sur les utilisateurs. Seul l'admin peut modifier/supprimer.
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_admin():
            queryset = User.objects.all().order_by("-created_at")
            role = self.request.query_params.get("role")
            if role:
                queryset = queryset.filter(user_roles__role__name=role)
            return queryset
        return User.objects.filter(pk=user.pk)

    # Permission fine exigée pour chaque écriture. Lire la liste des
    # utilisateurs reste ouvert à tous les rôles d'administration, mais créer,
    # modifier ou supprimer un compte demande la permission correspondante
    # (aujourd'hui portée par le seul super admin).
    WRITE_PERMISSIONS = {
        'create': 'create_user',
        'update': 'edit_user',
        'partial_update': 'edit_user',
        'destroy': 'delete_user',
    }

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'create', 'update', 'partial_update', 'destroy']:
            permission_classes = [IsAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def check_permissions(self, request):
        super().check_permissions(request)
        required = self.WRITE_PERMISSIONS.get(self.action)
        if required and not request.user.has_permission(required):
            raise PermissionDenied("Vous n'avez pas la permission de modifier les comptes utilisateurs.")

    def _ensure_can_touch(self, target):
        """Un compte d'administration n'est modifiable que par un super admin."""
        if target.is_admin() and not self.request.user.is_super_admin():
            raise PermissionDenied("Seul un super administrateur peut modifier un compte d'administration.")

    def perform_update(self, serializer):
        self._ensure_can_touch(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._ensure_can_touch(instance)
        instance.delete()

    @action(detail=False, methods=['get'], url_path='admin/dashboard/stats', permission_classes=[IsAdmin])
    def admin_dashboard_stats(self, request):
        """Retourne des statistiques de base pour le tableau de bord admin."""
        users_total = User.objects.count()
        users_active = User.objects.filter(is_active=True).count()
        users_unverified = User.objects.filter(is_verified=False).count()

        stores_total = Store.objects.count()
        stores_active = Store.objects.filter(status=Store.Status.ACTIVE).count()
        stores_pending_review = Store.objects.filter(status=Store.Status.INACTIVE).count()
        stores_suspended = Store.objects.filter(status=Store.Status.SUSPENDED).count()

        return Response({
            "users": {
                "total": users_total,
                "active": users_active,
                "unverified": users_unverified,
            },
            "stores": {
                "total": stores_total,
                "active": stores_active,
                "pending_review": stores_pending_review,
                "suspended": stores_suspended,
            },
            "trend": {
                "new_users": _daily_counts(User.objects.all()),
                "new_stores": _daily_counts(Store.objects.all()),
            },
        })


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lecture seule des rôles. Seul l'admin peut accéder.
    """
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAdmin]


class PermissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Lecture seule des permissions. Seul l'admin peut accéder.
    """
    queryset = Permission.objects.all()
    serializer_class = PermissionSerializer
    permission_classes = [IsAdmin]


class SuperAdminWriteMixin:
    """Lecture pour tout rôle d'administration, écriture pour le super admin."""

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [IsAdmin()]
        return [IsSuperAdmin()]


class UserRoleViewSet(SuperAdminWriteMixin, viewsets.ModelViewSet):
    """
    Attribution des rôles aux utilisateurs. Tout admin peut consulter ; seul le
    super admin peut attribuer ou retirer un rôle (sinon un admin spécialisé
    pourrait se nommer lui-même super admin).
    """
    queryset = UserRole.objects.all()
    serializer_class = UserRoleSerializer


class RolePermissionViewSet(SuperAdminWriteMixin, viewsets.ModelViewSet):
    """
    Permissions portées par chaque rôle. Tout admin peut consulter ; seul le
    super admin peut en ajouter ou en retirer.
    """
    queryset = RolePermission.objects.all()
    serializer_class = RolePermissionSerializer
