"""
Passerelles de paiement (Wave, Orange Money, carte bancaire).

Trois modes :

* ``SandboxGateway`` (actif quand ``PAYMENT_SANDBOX`` = True) simule le cycle
  de vie d'un paiement sans jamais contacter Wave/Orange Money.
* ``WaveGateway`` branche l'API Wave Business Checkout (redirection vers
  ``wave_launch_url``, confirmation par webhook signé HMAC).
* ``OrangeMoneyGateway`` branche l'API Orange Money Web Payment (jeton OAuth2,
  redirection vers ``payment_url``, confirmation par webhook vérifié via le
  ``notif_token`` reçu à la création du paiement).

Aucune clé marchande n'est commitée : tant que les clés ne sont pas fournies,
``get_gateway`` renvoie la passerelle demandée qui échoue proprement (erreur
claire) plutôt que de simuler un paiement en production — le défaut de
``PAYMENT_SANDBOX`` est False justement pour qu'un déploiement oublieux ne
tourne jamais en « faux paiements » sans le savoir.
"""
import base64
import hashlib
import hmac
import time
from decimal import Decimal, InvalidOperation

import requests
from django.conf import settings


class PaymentGatewayError(Exception):
    """Erreur d'appel à la passerelle réelle (refus, réseau, malformé)."""


def _payment_return_url(payment):
    """URL de retour du client après le paiement.

    Une seule page de retour pour tous les objets payés (commande, commande
    multi-boutiques, abonnement) : elle interroge l'API sur le statut réel du
    paiement — le retour navigateur n'est jamais une preuve de paiement — puis
    redirige vers la bonne page.

    Paiement lancé depuis l'appli mobile : ``&app=1`` fait afficher à cette
    page « revenez dans l'appli » (le navigateur n'y est pas connecté).
    """
    url = f"{settings.FRONTEND_URL.rstrip('/')}/paiement/retour?payment={payment.id}"
    if (payment.metadata or {}).get("return_to") == "app":
        url += "&app=1"
    return url


def _payment_cancel_url(payment):
    """URL de retour du client après une annulation ou une erreur de paiement."""
    return f"{_payment_return_url(payment)}&error=1"


def _same_amount(provider_amount, payment):
    """Vrai si le montant annoncé par le fournisseur est celui du paiement.

    XOF n'a pas de décimales : on compare en FCFA entiers. Un montant absent
    ou illisible n'est jamais considéré comme conforme.
    """
    try:
        return int(Decimal(str(provider_amount))) == int(payment.amount)
    except (InvalidOperation, TypeError, ValueError):
        return False


def _parse_wave_signature(header):
    """Décode l'entête ``Wave-Signature: t=<ts>,v1=<sig>[,v1=<sig2>]``.

    Retourne ``(timestamp, [signatures])`` — plusieurs ``v1=`` sont possibles
    pendant une rotation de secret (Wave les rejette à tour de rôle).
    """
    timestamp = None
    signatures = []
    for part in (header or "").split(","):
        key, sep, value = part.partition("=")
        if not sep:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)
    return timestamp, signatures


def verify_wave_signature(secret, header, raw_body, tolerance=300):
    """Vérifie la signature HMAC-SHA256 d'un webhook Wave.

    Le payload signé est ``timestamp + raw_body`` (concaténation, sans
    séparateur — voir docs.wave.com/webhook). La page Webhooks récente de
    Wave (comptabilité) utilise ``timestamp + "." + raw_body`` : on accepte
    les deux variantes pour rester robuste aux évolutions. Le corps doit
    être le flux brut reçu, jamais re-sérialisé. La tolérance anti-rejeu
    est de 5 minutes (limite officielle Wave).
    """
    if not secret or not header or raw_body is None:
        return False
    timestamp, signatures = _parse_wave_signature(header)
    if not timestamp or not signatures:
        return False
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    if abs(int(time.time()) - ts) > tolerance:
        return False
    if isinstance(raw_body, bytes):
        raw_body = raw_body.decode("utf-8", "replace")
    variants = (f"{timestamp}{raw_body}", f"{timestamp}.{raw_body}")
    for payload in variants:
        computed = hmac.new(
            secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        for received in signatures:
            if hmac.compare_digest(computed, received):
                return True
    return False


def _json_post(url, payload=None, headers=None, **kwargs):
    """POST JSON vers une passerelle avec gestion d'erreur commune.

    Lève ``PaymentGatewayError`` sur échec réseau ou réponse non-2xx, avec
    le détail du refus quand la passerelle en renvoie un.
    """
    timeout = kwargs.pop("timeout", 15)
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=timeout)
    except requests.RequestException as exc:
        raise PaymentGatewayError(f"Impossible de joindre {url} : {exc}")
    if response.status_code >= 400:
        detail = response.text[:400]
        try:
            body = response.json()
            detail = body.get("message") or body.get("error") or detail
        except ValueError:
            pass
        raise PaymentGatewayError(
            f"La passerelle {url} a refusé la demande "
            f"(HTTP {response.status_code}) : {detail}"
        )
    return response.json()


def _json_get(url, headers=None, params=None, timeout=15):
    """GET JSON vers une passerelle, mêmes règles d'erreur que `_json_post`."""
    try:
        response = requests.get(url, headers=headers, params=params, timeout=timeout)
    except requests.RequestException as exc:
        raise PaymentGatewayError(f"Impossible de joindre {url} : {exc}")
    if response.status_code >= 400:
        raise PaymentGatewayError(
            f"La passerelle {url} a refusé la demande (HTTP {response.status_code})."
        )
    try:
        return response.json()
    except ValueError:
        raise PaymentGatewayError(f"Réponse illisible de {url}.")


# Issue d'une vérification de statut auprès du fournisseur.
SUCCESS = "success"
FAILED = "failed"


class BasePaymentGateway:
    #: Vrai quand le moyen de paiement peut réellement encaisser.
    method = None

    def initiate(self, payment) -> dict:
        """Démarre le paiement. Retourne les infos à afficher/utiliser côté client."""
        raise NotImplementedError

    def fetch_status(self, payment):
        """Interroge le fournisseur sur le paiement.

        Retourne ``SUCCESS``, ``FAILED`` ou ``None`` (toujours en cours ou
        inconnu). Sert de filet de sécurité quand un webhook se perd : la
        page de retour du client et l'administration peuvent forcer une
        vérification.
        """
        return None

    def refund(self, payment):
        """Rembourse le client chez le fournisseur.

        Retourne True si le fournisseur a confirmé le remboursement, False si
        ce moyen de paiement n'a pas d'API de remboursement (traitement
        manuel par un administrateur).
        """
        return False


class SandboxGateway(BasePaymentGateway):
    """Simulation locale — ne contacte aucun vrai fournisseur de paiement."""

    method = "sandbox"

    def initiate(self, payment) -> dict:
        provider_ref = f"SANDBOX-{payment.id.hex[:10].upper()}"
        payment.provider_ref = provider_ref
        payment.save(update_fields=["provider_ref"])
        return {
            "sandbox": True,
            "provider_ref": provider_ref,
            "message": (
                "Mode test : aucune transaction réelle n'est envoyée à "
                f"{payment.method}. Utilisez l'action « sandbox-confirm » "
                "pour simuler le résultat du paiement."
            ),
        }


class WaveGateway(BasePaymentGateway):
    """
    Wave Business — Checkout API (docs.wave.com/checkout).

    Crée une session de paiement hébergée, renvoie la ``wave_launch_url`` à
    ouvrir dans le navigateur du client, puis attend la confirmation par
    webhook ``checkout.session.completed`` (signature HMAC-SHA256 vérifiée
    dans `PaymentWebhookView`).
    """

    method = "wave"
    CREATE_SESSION_URL = "/v1/checkout/sessions"

    def _url(self, path):
        return f"{settings.WAVE_API_BASE_URL.rstrip('/')}{path}"

    def _headers(self):
        if not settings.WAVE_API_KEY:
            raise PaymentGatewayError("WAVE_API_KEY n'est pas configurée.")
        return {
            "Authorization": f"Bearer {settings.WAVE_API_KEY}",
            "Content-Type": "application/json",
        }

    def _session_id(self, payment):
        ref = payment.provider_ref or ""
        return ref if ref.startswith("cos-") else None

    def get_session(self, payment):
        """Session de paiement Wave liée au paiement (None si aucune)."""
        session_id = self._session_id(payment)
        if not session_id:
            return None
        return _json_get(self._url(f"{self.CREATE_SESSION_URL}/{session_id}"), headers=self._headers())

    def initiate(self, payment) -> dict:
        headers = self._headers()

        # Une session encore ouverte (client revenu en arrière, double clic)
        # est réutilisée : une seule session payable à la fois par paiement.
        if self._session_id(payment):
            try:
                existing = self.get_session(payment)
            except PaymentGatewayError:
                existing = None
            if (
                existing
                and existing.get("checkout_status") == "open"
                and existing.get("wave_launch_url")
                and _same_amount(existing.get("amount"), payment)
            ):
                return {
                    "sandbox": False,
                    "method": "wave",
                    "provider_ref": existing.get("id"),
                    "checkout_url": existing["wave_launch_url"],
                    "message": "Redirection vers Wave pour valider le paiement.",
                }

        url = self._url(self.CREATE_SESSION_URL)
        payload = {
            # Montant dans la plus petite unité monétaire : XOF sans
            # décimale → exprimé en FCFA entiers.
            "amount": str(int(payment.amount)),
            "currency": payment.currency or "XOF",
            "client_reference": str(payment.id),
            "success_url": _payment_return_url(payment),
            "error_url": _payment_cancel_url(payment),
        }
        try:
            session = _json_post(url, payload, headers)
        except PaymentGatewayError as exc:
            raise PaymentGatewayError(f"Wave : {exc}")

        session_id = (session or {}).get("id")
        launch_url = (session or {}).get("wave_launch_url")
        if not session_id or not launch_url:
            raise PaymentGatewayError(f"Wave a répondu une session incomplète : {session}")

        payment.provider_ref = session_id
        payment.save(update_fields=["provider_ref"])
        return {
            "sandbox": False,
            "method": "wave",
            "provider_ref": session_id,
            "checkout_url": launch_url,
            "message": "Redirection vers Wave pour valider le paiement.",
        }

    def fetch_status(self, payment):
        session = self.get_session(payment)
        if not session:
            return None
        return wave_session_outcome(session, payment)

    def refund(self, payment):
        session_id = self._session_id(payment)
        if not session_id:
            raise PaymentGatewayError("Aucune session Wave n'est liée à ce paiement.")
        url = self._url(f"{self.CREATE_SESSION_URL}/{session_id}/refund")
        try:
            response = requests.post(url, headers=self._headers(), timeout=15)
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Wave : impossible de joindre {url} : {exc}")
        if response.status_code >= 400:
            raise PaymentGatewayError(
                f"Wave a refusé le remboursement (HTTP {response.status_code}) : {response.text[:300]}"
            )
        return True


def wave_session_outcome(session, payment):
    """Traduit une session Wave en issue de paiement.

    * ``succeeded`` → SUCCESS, seulement si montant et devise sont ceux du
      paiement (sinon refus : la session ne règle pas ce paiement-là) ;
    * session expirée sans paiement → FAILED ;
    * tentative refusée (``cancelled``) alors que la session reste ouverte →
      None : le client peut encore réessayer sur la même page Wave.
    """
    payment_status = str(session.get("payment_status") or "").lower()
    checkout_status = str(session.get("checkout_status") or "").lower()
    if payment_status == "succeeded":
        currency = str(session.get("currency") or "XOF").upper()
        if currency != (payment.currency or "XOF").upper() or not _same_amount(session.get("amount"), payment):
            raise PaymentGatewayError("Wave : montant ou devise de la session différents du paiement.")
        return SUCCESS
    if checkout_status == "expired":
        return FAILED
    return None


class OrangeMoneyGateway(BasePaymentGateway):
    """
    Orange Money — Web Payment API (developer.orange.com/apis/om-webpay).

    Récupère un jeton d'accès (OAuth2 client_credentials), crée un paiement
    hébergé, renvoie la ``payment_url`` au client et mémorise le
    ``notif_token`` dans ``Payment.metadata`` — c'est CE jeton que le webhook
    Orange doit réexpédier pour qu'on le croie (seule authentification,
    voir `verify_orange_notification`).
    """

    method = "orange_money"
    TOKEN_URL = "/oauth/v3/token"
    WEBPAYMENT_PATH = "/orange-money-webpay/{env}/v1/webpayment"
    STATUS_PATH = "/orange-money-webpay/{env}/v1/transactionstatus"

    def _api_base(self):
        return settings.ORANGE_MONEY_API_BASE_URL.rstrip("/")

    def _env(self):
        # "dev" = environnement de test d'Orange (vraies API, faux argent) ;
        # "sn" = production au Sénégal. Indépendant de PAYMENT_SANDBOX, qui
        # désigne la simulation interne sans aucun appel à Orange.
        return (settings.ORANGE_MONEY_COUNTRY_PATH or "sn").strip().strip("/")

    def _webpayment_path(self):
        return self.WEBPAYMENT_PATH.format(env=self._env())

    def _currency(self):
        # L'environnement de test d'Orange n'accepte que la devise fictive OUV.
        if self._env() == "dev":
            return "OUV"
        return settings.ORANGE_MONEY_CURRENCY or "XOF"

    def _access_token(self) -> str:
        if not settings.ORANGE_MONEY_CLIENT_ID or not settings.ORANGE_MONEY_CLIENT_SECRET:
            raise PaymentGatewayError(
                "ORANGE_MONEY_CLIENT_ID / ORANGE_MONEY_CLIENT_SECRET ne sont pas configurés."
            )
        credentials = f"{settings.ORANGE_MONEY_CLIENT_ID}:{settings.ORANGE_MONEY_CLIENT_SECRET}"
        basic = base64.b64encode(credentials.encode("utf-8")).decode("ascii")
        url = f"{self._api_base()}{self.TOKEN_URL}"
        try:
            response = requests.post(
                url,
                data={"grant_type": "client_credentials"},
                headers={
                    "Authorization": f"Basic {basic}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=15,
            )
        except requests.RequestException as exc:
            raise PaymentGatewayError(f"Impossible de joindre Orange Money : {exc}")
        if response.status_code >= 400:
            raise PaymentGatewayError(
                f"Orange Money a refusé le jeton d'accès (HTTP {response.status_code})."
            )
        token = (response.json() or {}).get("access_token")
        if not token:
            raise PaymentGatewayError("Orange Money n'a pas fourni de jeton d'accès.")
        return token

    def initiate(self, payment) -> dict:
        if not settings.ORANGE_MONEY_MERCHANT_KEY:
            raise PaymentGatewayError("ORANGE_MONEY_MERCHANT_KEY n'est pas configurée.")

        access_token = self._access_token()
        # order_id est notre référentiel de rapprochement : unique et court.
        # Orange refuse un order_id déjà utilisé (403) : chaque nouvelle
        # tentative du même paiement reçoit donc son propre suffixe.
        previous = (payment.metadata or {}).get("orange_money") or {}
        attempt = int(previous.get("attempt") or 0) + 1
        order_id = f"SM-{payment.id.hex[:12].upper()}-{attempt}"
        payment_id = str(payment.id)
        payload = {
            "merchant_key": settings.ORANGE_MONEY_MERCHANT_KEY,
            "currency": self._currency(),
            "order_id": order_id,
            "amount": int(payment.amount),
            "return_url": _payment_return_url(payment),
            "cancel_url": _payment_cancel_url(payment),
            "notif_url": f"{settings.BACKEND_URL.rstrip('/')}/payments/webhook/orange_money/",
            "lang": "fr",
            "reference": payment_id,
        }
        url = f"{self._api_base()}{self._webpayment_path()}"
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        try:
            result = _json_post(url, payload, headers)
        except PaymentGatewayError as exc:
            raise PaymentGatewayError(f"Orange Money : {exc}")

        pay_token = (result or {}).get("pay_token")
        payment_url = (result or {}).get("payment_url")
        notif_token = (result or {}).get("notif_token")
        if not pay_token or not payment_url or not notif_token:
            raise PaymentGatewayError(f"Orange Money a répondu une demande incomplète : {result}")

        # provider_ref : identifiant retenu pour retrouver le paiement à la
        # confirmation ; notif_token est la preuve d'authenticité du webhook.
        payment.provider_ref = pay_token
        metadata = dict(payment.metadata)
        history = list(metadata.get("orange_money_attempts") or [])
        if previous.get("pay_token"):
            history.append({k: previous.get(k) for k in ("order_id", "pay_token", "notif_token")})
        metadata["orange_money_attempts"] = history[-10:]
        metadata["orange_money"] = {
            "attempt": attempt,
            "order_id": order_id,
            "pay_token": pay_token,
            "notif_token": notif_token,
            "amount": str(payment.amount),
        }
        payment.metadata = metadata
        payment.save(update_fields=["provider_ref", "metadata"])
        return {
            "sandbox": False,
            "method": "orange_money",
            "provider_ref": pay_token,
            "checkout_url": payment_url,
            "message": "Redirection vers Orange Money pour valider le paiement.",
        }

    def _attempts(self, payment):
        metadata = payment.metadata or {}
        current = metadata.get("orange_money") or {}
        attempts = [current] if current.get("pay_token") else []
        attempts += [a for a in metadata.get("orange_money_attempts") or [] if a.get("pay_token")]
        return attempts

    def fetch_status(self, payment):
        """Statut via ``transactionstatus`` pour chaque tentative connue.

        Une tentative réussie suffit (le client a pu payer dans un ancien
        onglet) ; le paiement n'est en échec que si la dernière tentative
        l'est.
        """
        attempts = self._attempts(payment)
        if not attempts:
            return None
        access_token = self._access_token()
        url = f"{self._api_base()}{self.STATUS_PATH.format(env=self._env())}"
        headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
        latest = None
        for index, attempt in enumerate(attempts):
            result = _json_post(url, {
                "order_id": attempt.get("order_id"),
                "amount": int(payment.amount),
                "pay_token": attempt.get("pay_token"),
            }, headers)
            value = str((result or {}).get("status") or "").upper()
            if value == "SUCCESS":
                return SUCCESS
            if index == 0:
                latest = value
        if latest in ("FAILED", "EXPIRED"):
            return FAILED
        return None


def verify_orange_notification(payment, notif_token) -> bool:
    """Authentifie une notification Orange Money.

    Orange ne signe pas ses webhooks : la seule preuve que la notification
    vient bien d'elle est le ``notif_token`` — celui qu'elle a reçu en réponse
    à la création du paiement et qu'elle réexpédie. Comparaison en temps
    constant pour éviter les attaques par timing.
    """
    if not isinstance(notif_token, str) or not notif_token:
        return False
    metadata = payment.metadata or {}
    candidates = [(metadata.get("orange_money") or {}).get("notif_token")]
    candidates += [a.get("notif_token") for a in metadata.get("orange_money_attempts") or []]
    valid = False
    for stored in candidates:
        if isinstance(stored, str) and stored and hmac.compare_digest(stored, notif_token):
            valid = True
    return valid


METHOD_LABELS = {
    "wave": "Wave",
    "orange_money": "Orange Money",
    "card": "Carte bancaire",
}


def _configured(method):
    if method == "wave":
        return bool(settings.WAVE_API_KEY)
    if method == "orange_money":
        return bool(
            settings.ORANGE_MONEY_CLIENT_ID
            and settings.ORANGE_MONEY_CLIENT_SECRET
            and settings.ORANGE_MONEY_MERCHANT_KEY
        )
    # Aucune passerelle carte n'est branchée : la carte n'existe qu'en
    # simulation.
    return False


def available_methods():
    """Moyens de paiement proposables aux clients sur cet environnement."""
    sandbox = bool(settings.PAYMENT_SANDBOX)
    return [
        {"id": method, "label": label}
        for method, label in METHOD_LABELS.items()
        if sandbox or _configured(method)
    ]


def is_method_available(method):
    return any(m["id"] == method for m in available_methods())


def get_gateway(method: str) -> BasePaymentGateway:
    if settings.PAYMENT_SANDBOX:
        return SandboxGateway()
    gateway = {
        "wave": WaveGateway,
        "orange_money": OrangeMoneyGateway,
    }.get(method)
    if gateway is None:
        # Jamais de repli silencieux sur la simulation en production : un
        # moyen sans passerelle réelle ne peut pas encaisser.
        raise PaymentGatewayError(
            f"Le moyen de paiement « {METHOD_LABELS.get(method, method)} » n'est pas disponible."
        )
    return gateway()