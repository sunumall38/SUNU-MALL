"""
Endpoints de génération de rapports administrateur (PDF/CSV).

Le rapport est renvoyé directement en pièce jointe de la réponse, à
l'utilisateur authentifié qui l'a demandé. Il n'est plus écrit dans le
stockage média : ces fichiers contiennent des emails de clients et de
vendeurs, des montants et des dossiers KYC, et le bucket média est en lecture
publique en auto-hébergement (nom de fichier devinable à la seconde près,
fichiers jamais purgés).

Note : le paramètre du format est volontairement nommé `fmt` (et non `format`)
car DRF réserve `?format=` à la négociation du rendu de la réponse (json/html)
— `?format=csv` déclencherait un Http404 avant même d'appeler la vue.
"""
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.security.utils import log_admin_event
from apps.users.permissions import HasPermission

from .generators import GENERATORS, render_csv, render_pdf

CONTENT_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "pdf": "application/pdf",
}


class CanExportReports(HasPermission):
    """Permission fine `reports.export` (super admin, admin finance)."""
    required_permission = "reports.export"


class ReportView(APIView):
    """GET /api/reports/<type>/?fmt=csv|pdf → le fichier, en pièce jointe."""
    permission_classes = [IsAuthenticated, CanExportReports]
    throttle_classes = []

    def get(self, request, report_type):
        generator = GENERATORS.get(report_type)
        if generator is None:
            return Response({"detail": "Type de rapport inconnu."}, status=404)

        report_format = request.query_params.get("fmt", "csv").lower()
        if report_format not in CONTENT_TYPES:
            return Response({"detail": "Format non supporté (csv ou pdf)."}, status=400)

        report = generator()
        stamp = timezone.now().strftime("%Y%m%d-%H%M%S")
        filename = f"rapport-{report_type}-{stamp}.{report_format}"
        content = render_csv(report) if report_format == "csv" else render_pdf(report)

        log_admin_event(
            request.user, "other", request,
            object_type="report", object_id=report_type,
            summary=f"Export du rapport « {report_type} » ({report_format})",
            metadata={"format": report_format, "size": len(content)},
        )

        response = HttpResponse(content, content_type=CONTENT_TYPES[report_format])
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        # Données personnelles et financières : jamais de copie en cache.
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
