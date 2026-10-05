from rest_framework import serializers
from .models import User, Role, Permission, UserRole, RolePermission
from .phone import normalize_senegal_phone


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "phone",
            "is_active",
            "is_verified",
            "created_at",
            "roles",
            "permissions",
        ]
        read_only_fields = ["id", "created_at", "roles", "permissions"]

    def get_roles(self, obj):
        return [ur.role.name for ur in obj.user_roles.select_related("role").all()]

    def get_permissions(self, obj):
        return [p.code for p in obj.get_permissions()]

    def validate_phone(self, value):
        if not value:
            return ""
        phone = normalize_senegal_phone(value)
        queryset = User.objects.filter(phone=phone)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                "Ce numéro de téléphone est déjà utilisé."
            )
        return phone


class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "code", "label", "created_at"]
        read_only_fields = ["id", "created_at"]


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ["id", "name", "description", "created_at", "permissions"]
        read_only_fields = ["id", "created_at"]

    def get_permissions(self, obj):
        return [
            rp.permission.code
            for rp in obj.role_permissions.select_related("permission").all()
        ]


class UserRoleSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    role_name = serializers.CharField(source="role.name", read_only=True)

    class Meta:
        model = UserRole
        fields = ["id", "user", "user_email", "role", "role_name", "created_at"]
        read_only_fields = ["id", "created_at"]


class RolePermissionSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source="role.name", read_only=True)
    permission_code = serializers.CharField(source="permission.code", read_only=True)

    class Meta:
        model = RolePermission
        fields = [
            "id",
            "role",
            "role_name",
            "permission",
            "permission_code",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]
