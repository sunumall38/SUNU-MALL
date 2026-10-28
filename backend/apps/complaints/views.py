"""
Vues du support client : plaintes (workflow + export PDF) et tickets.

Permissions :
- un utilisateur crée ses propres plaintes ; un admin (support) voit tout ;
- les actions de traitement (assigner / commencer / escalader / répondre /
  résoudre / clore / rouvrir) exigent `complaints.*` ;
- les tickets sont accessibles à leur requérant et au support.
"""
import logging

from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.security.utils import _client_ip, log_admin_event
from apps.users.permissions import HasPermission

from .models import Complaint, ComplaintAttachment, ComplaintTimeline, SupportTicket, TicketMessage
from .pdf import complaint_dossier_pdf
from .serializers import (
    ComplaintCreateSerializer, ComplaintSerializer, SupportTicketSerializer, TicketMessageSerializer,
)

logger = logging.getLogger(__name__)


class HasComplaintsView(HasPermission):
    required_permission = "complaints.view"


class HasComplaintsManage(HasPermission):
    required_permission = "complaints.manage"


class ComplaintViewSet(viewsets.ModelViewSet):
    """Plaintes : lecture par leur émetteur, tout par le support admin."""
    serializer_class = ComplaintSerializer
    queryset = Complaint.objects.all()
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == "create":
            return [permissions.IsAuthenticated()]
        if self.action in ["assign", "start", "escalate", "respond", "resolve",
                           "close", "reopen", "add_attachment"]:
            return [permissions.IsAuthenticated(), HasComplaintsManage()]
        return [permissions.IsAuthenticated()]

    def get_serializer_class(self):
        if self.action == "create":
            return ComplaintCreateSerializer
        return ComplaintSerializer

    def get_queryset(self):
        qs = super().get_queryset().select_related(
            "complainant", "assignee", "store", "order", "delivery"
        ).prefetch_related("timeline", "attachments")
        user = self.request.user
        if user.is_admin():
            qs = self._apply_filters(qs)
        else:
            qs = qs.filter(complainant=user)
        return qs

    def _apply_filters(self, qs):
        """Filtres du centre admin : statut, priorité, période, recherche."""
        params = self.request.query_params
        status_ = params.get("status")
        priority = params.get("priority")
        date_from = params.get("created_from")
        date_to = params.get("created_to")
        search = params.get("search")
        if status_:
            qs = qs.filter(status=status_)
        if priority:
            qs = qs.filter(priority=priority)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)
        if search:
            qs = qs.filter(
                Q(reference__icontains=search)
                | Q(subject__icontains=search)
                | Q(complainant__email__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        complaint = serializer.save(complainant=self.request.user)
        complaint.append_timeline(self.request.user, ComplaintTimeline.Action.CREATED,
                                  note="Plainte déposée par l'utilisateur")
        return Response(ComplaintSerializer(complaint).data,
                        status=status.HTTP_201_CREATED)

    # --- Workflow de traitement (actions validées en permissions) ---

    def _transition(self, request, pk, target_status, action_code, note="", extra_save=None):
        complaint = self.get_object()
        complaint.status = target_status
        if extra_save:
            extra_save(complaint)
        complaint.save()
        complaint.append_timeline(request.user, action_code, note=note)
        return Response(self.get_serializer(complaint).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        """Assigne la plainte à un administrateur du support."""
        return self._transition(
            request, pk, Complaint.Status.ASSIGNED, ComplaintTimeline.Action.ASSIGNED,
            note=request.data.get("note", ""),
            extra_save=lambda c: setattr(c, "assignee_id", request.data.get("assignee") or c.assignee_id),
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Démarre le traitement (assignée → en cours)."""
        return self._transition(
            request, pk, Complaint.Status.IN_PROGRESS, ComplaintTimeline.Action.STARTED,
            note=request.data.get("note", ""),
        )

    @action(detail=True, methods=["post"])
    def escalate(self, request, pk=None):
        """Escale une plainte bloquée (remonte au niveau supérieur)."""
        return self._transition(
            request, pk, Complaint.Status.ESCALATED, ComplaintTimeline.Action.ESCALATED,
            note=request.data.get("note", "Escale"),
        )

    @action(detail=True, methods=["post"])
    def respond(self, request, pk=None):
        """Réponse apportée au plaignant (laisse la plainte en cours)."""
        return self._transition(
            request, pk, Complaint.Status.IN_PROGRESS, ComplaintTimeline.Action.RESPONDED,
            note=request.data.get("note", ""),
        )

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        """Résout : exige une décision (remboursement, échange, retour...)."""
        decision = request.data.get("decision", "")
        if decision not in Complaint.Decision.values:
            raise ValidationError("Champ 'decision' requis (refund, exchange, return, compensation, info, no_action).")
        complaint = self.get_object()
        complaint.status = Complaint.Status.RESOLVED
        complaint.resolution_decision = decision
        complaint.resolution_note = request.data.get("resolution_note", "")
        complaint.resolved_at = timezone.now()
        complaint.save()
        complaint.append_timeline(request.user, ComplaintTimeline.Action.RESOLVED,
                                  note="Décision : " + complaint.get_resolution_decision_display())
        log_admin_event(request.user, "resolve", request, object_type="Complaint",
                        object_id=complaint.reference, summary=f"Plainte résolue : {complaint.reference}")
        return Response(self.get_serializer(complaint).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        complaint = self.get_object()
        complaint.status = Complaint.Status.CLOSED
        complaint.closed_at = timezone.now()
        complaint.save()
        complaint.append_timeline(request.user, ComplaintTimeline.Action.CLOSED, note=request.data.get("note", ""))
        return Response(self.get_serializer(complaint).data)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        complaint = self.get_object()
        complaint.status = Complaint.Status.OPEN
        complaint.resolved_at = None
        complaint.closed_at = None
        complaint.save()
        complaint.append_timeline(request.user, ComplaintTimeline.Action.REOPENED, note=request.data.get("note", ""))
        return Response(self.get_serializer(complaint).data)

    @action(detail=True, methods=["post"])
    def add_attachment(self, request, pk=None):
        complaint = self.get_object()
        attachment = ComplaintAttachment.objects.create(
            complaint=complaint,
            filename=request.data.get("filename", "piece-jointe"),
            content_type=request.data.get("content_type", ""),
            size_bytes=int(request.data.get("size_bytes", 0) or 0),
            storage_key=request.data.get("storage_key", ""),
            uploaded_by=request.user,
        )
        return Response({"id": str(attachment.id), "filename": attachment.filename},
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="pdf")
    def export_pdf(self, request, pk=None):
        """Dossier PDF de la plainte (historique complet)."""
        complaint = self.get_object()
        timeline = complaint.timeline.select_related("actor").all()
        attachments = complaint.attachments.all()
        pdf_bytes = complaint_dossier_pdf(complaint, timeline, attachments)
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="dossier-{complaint.reference}.pdf"'
        return response


class SupportTicketViewSet(viewsets.ModelViewSet):
    """Tickets de support : requérant ou support."""
    serializer_class = SupportTicketSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        return SupportTicketSerializer

    def get_queryset(self):
        qs = SupportTicket.objects.select_related("requester", "assigned_to").prefetch_related("messages")
        user = self.request.user
        if user.is_admin():
            return qs
        return qs.filter(requester=user)

    def perform_create(self, serializer):
        serializer.save(requester=self.request.user)

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        """Réponse (requérant ou support) — une réponse support archive l'état."""

        ticket = self.get_object()
        body = request.data.get("body", "").strip()
        if not body:
            raise ValidationError("Champ 'body' requis.")
        is_support = request.user.is_admin()
        TicketMessage.objects.create(
            ticket=ticket, author=request.user, body=body, is_support_reply=is_support,
        )
        if is_support:
            if ticket.status in [SupportTicket.Status.NEW, SupportTicket.Status.OPEN]:
                ticket.status = SupportTicket.Status.ANSWERED
        else:
            ticket.status = SupportTicket.Status.OPEN
        ticket.save()
        return Response(TicketMessageSerializer(ticket.messages.last()).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def resolve(self, request, pk=None):
        if not request.user.is_admin():
            self.permission_denied(request, message="Seul le support peut résoudre un ticket.")
        ticket = self.get_object()
        ticket.status = SupportTicket.Status.RESOLVED
        ticket.save()
        return Response(self.get_serializer(ticket).data)

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        ticket = self.get_object()
        if not request.user.is_admin() and ticket.requester_id != request.user.id:
            self.permission_denied(request, message="Seul le support ou le requérant peut clore ce ticket.")
        ticket.status = SupportTicket.Status.CLOSED
        ticket.save()
        return Response(self.get_serializer(ticket).data)

class ContactThrottle(AnonRateThrottle):
    """Formulaire public : quelques messages par heure et par adresse IP."""

    scope = "contact"
    rate = "5/hour"


class ContactMessageView(APIView):
    """
    POST /api/complaints/contact/  {"name", "email", "subject", "message"}

    Enregistre le message puis prévient l'équipe par email (réponse directe
    possible : Reply-To = l'adresse du visiteur). Le champ caché « website »
    piège les robots : rempli, le message est ignoré en silence.
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [ContactThrottle]

    def post(self, request):
        from django.conf import settings as dj_settings
        from django.core.mail import EmailMessage

        from .models import ContactMessage
        from .serializers import ContactMessageSerializer

        serializer = ContactMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        ok = {"message": "Merci ! Votre message a bien été envoyé. Nous vous répondons sous 24h ouvrées."}
        if data.pop("website", ""):
            return Response(ok, status=status.HTTP_201_CREATED)

        contact = ContactMessage.objects.create(ip_address=_client_ip(request), **data)
        recipient = getattr(dj_settings, "CONTACT_EMAIL", "") or dj_settings.ADMIN_NOTIFICATION_EMAIL
        if recipient:
            try:
                EmailMessage(
                    subject=f"[Contact SUNU MALL] {contact.subject or 'Demande'}",
                    body=f"De : {contact.name} <{contact.email}>\n\n{contact.message}",
                    from_email=dj_settings.DEFAULT_FROM_EMAIL,
                    to=[recipient],
                    reply_to=[contact.email],
                ).send(fail_silently=False)
                contact.notified = True
                contact.save(update_fields=["notified"])
            except Exception:  # noqa: BLE001 — le message reste enregistré
                logger.exception("Notification du message de contact %s non envoyée", contact.id)
        return Response(ok, status=status.HTTP_201_CREATED)
