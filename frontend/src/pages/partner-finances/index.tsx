import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Wallet } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as partnerApi from "@/api/partner";
import { formatDate, formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import type { PartnerInvoice } from "@/types";

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente de paiement",
  paid: "Payée",
  contested: "Contestée",
};

const INVOICE_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  draft: "default",
  pending: "warning",
  paid: "success",
  contested: "danger",
};

function InvoiceDeliveries({ invoiceId }: { invoiceId: number }) {
  const { data, loading, error, refetch } = useAsync(() => partnerApi.getPartnerInvoice(invoiceId), [invoiceId]);
  if (loading) return <Spinner label="Chargement du détail…" />;
  if (error || !data) return <ErrorState onRetry={refetch} />;
  return (
    <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto">
      {data.deliveries.map((delivery) => (
        <li key={delivery.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
          <span className="font-mono text-ink">{delivery.reference}</span>
          <span className="text-muted-foreground">{delivery.delivered_at ? formatDate(delivery.delivered_at) : "—"}</span>
          <span className="font-semibold text-ink">{formatPrice(delivery.partner_cost)}</span>
        </li>
      ))}
    </ul>
  );
}

function InvoiceRow({ invoice }: { invoice: PartnerInvoice }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{invoice.reference}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(invoice.period_start)} → {formatDate(invoice.period_end)} · {invoice.marketplace_deliveries_count}{" "}
            livraison(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-ink">{formatPrice(invoice.balance)}</p>
          <Badge variant={INVOICE_STATUS_VARIANT[invoice.status] ?? "default"}>{INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}</Badge>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {invoice.paid_at
              ? `Virement effectué le ${formatDate(invoice.paid_at)}.`
              : invoice.due_date
                ? `Virement prévu au plus tard le ${formatDate(invoice.due_date)}.`
                : "Virement en préparation."}
          </p>
          <InvoiceDeliveries invoiceId={invoice.id} />
        </div>
      )}
    </Card>
  );
}

export default function PartnerFinancesPage() {
  const { data: invoices, loading, error, refetch } = useAsync(() => partnerApi.listPartnerInvoices(), []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-gray-900">
        <Wallet className="h-6 w-6 text-orange" /> Finances & factures
      </h1>
      <p className="text-sm text-muted-foreground">
        Chaque début de mois, Sunu Mall émet une facture du mois écoulé : le coût partenaire de chaque course livrée, tel
        que fixé pour sa zone. Le montant est versé avant l'échéance indiquée.
      </p>

      {loading ? (
        <Spinner label="Chargement des factures…" />
      ) : error ? (
        <ErrorState fullPage onRetry={refetch} />
      ) : !invoices || invoices.length === 0 ? (
        <EmptyState icon={FileText} title="Aucune facture" description="Vos factures mensuelles de livraison apparaîtront ici." />
      ) : (
        <div className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <InvoiceRow key={invoice.id} invoice={invoice} />
          ))}
        </div>
      )}
    </div>
  );
}