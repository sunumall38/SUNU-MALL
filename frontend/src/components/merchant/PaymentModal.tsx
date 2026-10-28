import { useState } from "react";
import { CheckCircle2, FlaskConical, Loader2, TriangleAlert, XCircle } from "lucide-react";
import * as paymentsApi from "@/api/payments";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { ApiError } from "@/lib/api";
import { formatPrice } from "@/lib/utils";
import { startPayment, usePaymentMethods } from "@/lib/paymentFlow";
import { Spinner } from "@/components/ui/Spinner";
import type { Payment } from "@/types";

/**
 * Parcours de paiement d'abonnement (souscription, renouvellement,
 * changement de formule) : choix du moyen → création d'un paiement en attente
 * côté backend → page Wave / Orange Money (retour sur /paiement/retour) ou,
 * en mode test, confirmation simulée.
 * Le backend reste la seule source de vérité : rien n'est activé côté
 * frontend, le statut est calculé après confirmation serveur du paiement.
 */
export function PaymentModal({
  title,
  amount,
  periodLabel,
  createPayment,
  onClose,
  onSuccess,
}: {
  title: string;
  amount: string;
  periodLabel?: string;
  createPayment: (method: "wave" | "orange_money" | "card") => Promise<{ payment: Payment | null }>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { methods: METHODS, sandbox, loading: methodsLoading } = usePaymentMethods();
  const [chosen, setMethod] = useState<"wave" | "orange_money" | "card" | null>(null);
  const method = chosen && METHODS.some((m) => m.id === chosen) ? chosen : METHODS[0]?.id ?? null;
  const [creating, setCreating] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<Payment | null>(null);
  const [confirming, setConfirming] = useState<"success" | "failed" | null>(null);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!method) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createPayment(method);
      // Offre gratuite ou premier mois gratuit : aucun paiement à confirmer,
      // l'abonnement a déjà été activé côté serveur.
      if (!result.payment) {
        onSuccess();
        return;
      }
      if (!sandbox) {
        const started = await startPayment(result.payment.id);
        if (started.kind === "redirect") {
          setRedirecting(true);
          return;
        }
      }
      setPendingPayment(result.payment);
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as { error?: string; payment_method?: string }) : null;
      setError(data?.error ?? data?.payment_method ?? "Impossible de préparer le paiement pour le moment.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSandboxOutcome(outcome: "success" | "failed") {
    if (!pendingPayment) return;
    setConfirming(outcome);
    try {
      await paymentsApi.sandboxConfirmPayment(pendingPayment.id, outcome);
      if (outcome === "success") {
        onSuccess();
        onClose();
      } else {
        setPaymentFailed(true);
      }
    } finally {
      setConfirming(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} size="sm">
      {redirecting && <Spinner label="Redirection vers la page de paiement sécurisée…" />}

      {!pendingPayment && !redirecting && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-ink">{formatPrice(amount)}</span>
            {periodLabel ? ` ${periodLabel}` : ""}
          </p>
          <div className="flex flex-col gap-2">
            {methodsLoading && <Spinner label="Chargement des moyens de paiement…" />}
            {!methodsLoading && METHODS.length === 0 && (
              <p className="text-sm text-muted-foreground">Le paiement en ligne n'est pas encore ouvert.</p>
            )}
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)} className="text-left">
                <Card variant="interactive" className={method === m.id ? "border-orange ring-1 ring-orange" : ""}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-accent text-orange">
                      {m.image ? (
                        <img src={m.image} alt={m.label} className="h-full w-full object-cover" />
                      ) : (
                        m.icon && <m.icon className="h-4 w-4" />
                      )}
                    </span>
                    <p className="text-sm font-semibold text-ink">{m.label}</p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button onClick={handleCreate} loading={creating} disabled={!method} className="w-full">
            {creating ? "Préparation…" : `Payer ${formatPrice(amount)}`}
          </Button>
        </div>
      )}

      {pendingPayment && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <FlaskConical className="h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Mode test (sandbox)</p>
              <p>Aucune vraie transaction Wave/Orange Money/carte n'est envoyée.</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatPrice(pendingPayment.amount)} via {METHODS.find((m) => m.id === pendingPayment.method)?.label}
          </p>

          {paymentFailed ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-danger" />
              </span>
              <p className="text-sm font-medium text-danger">Paiement simulé en échec.</p>
              <Button onClick={() => handleSandboxOutcome("success")} loading={confirming === "success"}>
                Réessayer (simuler succès)
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button onClick={() => handleSandboxOutcome("success")} loading={confirming === "success"} className="flex-1">
                {confirming === "success" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Simuler paiement réussi
              </Button>
              <Button variant="secondary" onClick={() => handleSandboxOutcome("failed")} loading={confirming === "failed"}>
                Simuler échec
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}