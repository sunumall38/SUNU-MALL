from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from apps.users.models import User, Role, UserRole
from apps.users.phone import normalize_senegal_phone

ALLOWED_REGISTRATION_ROLES = {"client", "merchant", "driver"}


class RegisterSerializer(serializers.ModelSerializer):
    """
    Inscription : ne collecte plus la pièce d'identité du vendeur. Le dossier
    KYC (SellerKYC) est déposé plus tard, à la première connexion, via
    POST /api/kyc/seller-kyc/submit/ (apps/kyc/views.py) — tant qu'il n'est
    pas VERIFIED, MerchantKycGate bloque le reste de l'espace vendeur.
    """

    password = serializers.CharField(write_only=True, min_length=8)
    role_name = serializers.ChoiceField(
        choices=[(r, r) for r in sorted(ALLOWED_REGISTRATION_ROLES)],
        write_only=True,
        required=False,
        default="client",
    )

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "phone", "password", "role_name")

    def validate_phone(self, value):
        phone = normalize_senegal_phone(value)
        if User.objects.filter(phone=phone).exists():
            raise serializers.ValidationError(
                "Ce numéro de téléphone est déjà utilisé."
            )
        return phone

    def create(self, validated_data):
        role_name = validated_data.pop("role_name", "client")

        username = validated_data["email"]

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=validated_data["email"],
                password=validated_data["password"],
                first_name=validated_data.get("first_name", ""),
                last_name=validated_data.get("last_name", ""),
                phone=validated_data.get("phone", ""),
            )

            role, _ = Role.objects.get_or_create(name=role_name)
            UserRole.objects.create(user=user, role=role)

            return user


class LoginSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=False)
    # Compatibilité de transition pour les anciens clients API. La nouvelle
    # interface envoie uniquement `phone`.
    email = serializers.EmailField(required=False, write_only=True)
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        phone = data.get("phone")
        legacy_email = data.get("email")
        password = data.get("password")

        if not password or not (phone or legacy_email):
            raise serializers.ValidationError(
                "Numéro de téléphone et mot de passe requis.", code="authorization"
            )

        if phone:
            try:
                normalized_phone = normalize_senegal_phone(phone)
            except DjangoValidationError:
                raise serializers.ValidationError(
                    "Identifiants incorrects.", code="authorization"
                )
            matches = User.objects.filter(phone=normalized_phone)[:2]
            if len(matches) != 1:
                # Une réponse générique évite l'énumération des comptes. Un
                # doublon historique doit être corrigé avant toute connexion.
                raise serializers.ValidationError(
                    "Identifiants incorrects.", code="authorization"
                )
            email = matches[0].email
        else:
            email = legacy_email

        user = authenticate(
            request=self.context.get("request"), email=email, password=password
        )
        if not user:
            raise serializers.ValidationError(
                "Identifiants incorrects.", code="authorization"
            )

        if not user.is_active:
            raise serializers.ValidationError(
                "Ce compte est désactivé.", code="authorization"
            )

        return user


class ResendVerificationSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=False)
    email = serializers.EmailField(required=False, write_only=True)

    def validate(self, attrs):
        if not attrs.get("phone") and not attrs.get("email"):
            raise serializers.ValidationError("Numéro de téléphone requis.")
        if attrs.get("phone"):
            attrs["phone"] = normalize_senegal_phone(attrs["phone"])
        return attrs


class GuestCheckoutSerializer(serializers.Serializer):
    """
    Crée silencieusement un compte client sans mot de passe, pour permettre un
    achat sans étape d'inscription visible avant paiement.

    Un email déjà connu est toujours refusé, que le compte ait un mot de passe
    ou non : cette route est publique et renvoie des jetons de session, elle ne
    doit donc jamais ouvrir ni modifier un compte existant sur simple
    présentation de son adresse email (prise de contrôle du compte).
    """

    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    phone = serializers.CharField(max_length=30)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "Cet email est déjà associé à un compte. Merci de vous connecter."
            )
        return value

    def validate_phone(self, value):
        phone = normalize_senegal_phone(value)
        email = (self.initial_data.get("email") or "").strip().lower()
        if User.objects.filter(phone=phone).exclude(email=email).exists():
            raise serializers.ValidationError(
                "Ce numéro de téléphone est déjà utilisé."
            )
        return phone

    def save(self):
        data = self.validated_data
        with transaction.atomic():
            user = User.objects.create_user(
                username=data["email"],
                email=data["email"],
                first_name=data["first_name"],
                last_name=data.get("last_name", ""),
                phone=data["phone"],
            )
            user.set_unusable_password()
            user.save()
            role, _ = Role.objects.get_or_create(name="client")
            UserRole.objects.create(user=user, role=role)
        return user


class SetPasswordSerializer(serializers.Serializer):
    """Transforme un compte invité (sans mot de passe) en compte complet."""

    password = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value):
        # Applique AUTH_PASSWORD_VALIDATORS (mots de passe trop courants,
        # entièrement numériques, trop proches de l'email…).
        validate_password(value, self.context["request"].user)
        return value


class ChangePasswordSerializer(serializers.Serializer):
    """Changement de mot de passe (ancien + confirmation)."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                "La confirmation ne correspond pas au nouveau mot de passe."
            )
        return attrs
