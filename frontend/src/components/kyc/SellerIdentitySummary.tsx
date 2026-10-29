import { FileText, ShieldAlert, UserRound } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as kycApi from "@/api/kyc";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";
import type { KycStatus } from "@/types";

const STATUS_LABEL: Record<KycStatus, { label: string; variant: "default" | "success" | "warning" | "danger" }> = {
  PENDING: { label: "Pièce non envoyée", variant: "danger" },
  SUBMITTED: { label: "Pièce reçue", variant: "warning" },
  UNDER_REVIEW: { label: "Pièce en examen", variant: "warning" },
  VERIFIED: { label: "Identité vérifiée", variant: "success" },
  REJECTED: { label: "Pièce refusée", variant: "danger" },
  SUSPENDED: { label: "Vendeur suspendu", variant: "danger" },
  BLOCKED: { label: "Vendeur bloqué", variant: "danger" },
};

/**
 * Identité du propriétaire d'une boutique, pour l'écran de validation : la
 * décision de l'administration porte à la fois sur la boutique et sur cette
 * pièce d'identité.
 */
export function SellerIdentitySummary({ sellerId }: { sellerId: string }) {
  const { data, loading, error } = useAsync(
    () => kycApi.listSellerKycs({ seller: sellerId }).then((page) => page.results[0] ?? null),
    [sellerId],
  );

  if (loading) return <Spinner label="Chargement de l'identité…" />;
  if (error) return <p className="text-sm text-danger">Impossible de charger la pièce d'identité.</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-danger">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        Aucune pièce d'identité envoyée : le dossier ne peut pas encore être validé.
      </p>
    );
  }

  const status = STATUS_LABEL[data.status];
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-semibold text-ink">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          {data.seller_name || data.seller_email}
          {data.seller_phone && <span className="font-normal text-muted-foreground">· {data.seller_phone}</span>}
        </span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink">
        {[
          { url: data.document_front_url, label: "Recto" },
          { url: data.document_back_url, label: "Verso" },
        ].map(
          (doc) =>
            doc.url && (
              <a
                key={doc.label}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-semibold text-orange hover:text-orange-dark"
              >
                <FileText className="h-3.5 w-3.5" /> {doc.label}
              </a>
            ),
        )}
        {data.address && <span className="text-muted-foreground">Adresse : {data.address}</span>}
        {data.submitted_at && <span className="text-muted-foreground">Envoyée le {formatDate(data.submitted_at)}</span>}
      </div>
      {data.fraud_flags.map((flag) => (
        <p key={flag.code} className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" /> {flag.message}
        </p>
      ))}
    </div>
  );
}
