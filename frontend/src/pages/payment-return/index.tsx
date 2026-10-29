import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { Clock, CreditCard, Smartphone, XCircle } from "lucide-react";
import * as paymentsApi from "@/api/payments";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { apiErrorMessage } from "@/lib/api";
import { MAX_CHECKS, POLL_INTERVAL_MS, startPayment, successDestination } from "@/lib/paymentFlow";
import { formatPrice } from "@/lib/utils";
import type { Payment } from "@/types";


function backDestination(payment: Payment): { to: string; label: string } {
  if (payment.subscription) return { to: "/subscriptions", label: "Retour aux abonnements" };
  return { to: "/orders", label: "Voir mes commandes" };
}

/**
 * Retour du client après la page Wave / Orange Money.
 *
 * Le retour navigateur ne prouve rien : le statut est demandé au backend,
 * qui le vérifie lui-même auprès du fournisseur (webhook ou interrogation
 * directe). Tant qu'il est « en attente », la page revérifie régulièrement.
 */
export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams();
  // Paiement lancé depuis l'appli mobile (`&app=1`) : le navigateur n'est
  // pas connecté au compte, c'est l'appli qui vérifie le paiement.
  if (searchParams.get("app") === "1") {
    return <AppPaymentReturn paymentId={searchParams.get("payment")} failed={searchParams.get("error") === "1"} />;
  }
  return <WebPaymentReturn />;
}

function AppPaymentReturn({ paymentId, failed }: { paymentId: string | null; failed: boolean }) {
  const appLink = paymentId ? `sunumall://client/payment/${encodeURIComponent(paymentId)}` : "sunumall://";
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent">
          <Smartphone className="h-8 w-8 text-orange" />
        </span>
        <p className="font-semibold text-ink">
          {failed ? "Le paiement n'a pas abouti" : "Retournez dans l'appli Sunu Mall"}
        </p>
        <p className="text-sm text-muted-foreground">
          {failed
            ? "Revenez dans l'appli Sunu Mall pour réessayer."
            : "La confirmation de votre paiement s'affiche dans l'appli."}
        </p>
        <a href={appLink}>
          <Button>Ouvrir l'appli Sunu Mall</Button>
        </a>
        <p className="text-xs text-muted-foreground">Si rien ne se passe, ouvrez simplement l'appli.</p>
      </Card>
    </div>
  );
}

function WebPaymentReturn() {
  const [searchParams] = useSearchParams();
  const paymentId = searchParams.get("payment");
  const providerReportedError = searchParams.get("error") === "1";

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checks, setChecks] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!paymentId) return;
    try {
      const result = await paymentsApi.refreshPayment(paymentId);
      setPayment(result);
      setLoadError(null);
    } catch (err) {
      setLoadError(apiErrorMessage(err, "Impossible de vérifier le paiement."));
    } finally {
      setChecks((n) => n + 1);
    }
  }, [paymentId]);

  useEffect(() => {
    void check();
  }, [check]);

  const stillPending = !payment || payment.status === "pending";
  // Erreur signalée par le fournisseur : une seule vérification suffit, on
  // propose tout de suite de réessayer au lieu de faire patienter.
  const keepPolling = stillPending && !providerReportedError && checks > 0 && checks < MAX_CHECKS && !loadError;

  useEffect(() => {
    if (!keepPolling) return;
    timer.current = setTimeout(() => void check(), POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [keepPolling, checks, check]);

  async function handleRetry() {
    if (!payment) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const result = await startPayment(payment.id);
      if (result.kind === "sandbox") {
        // Simulation : la confirmation se fait depuis la commande.
        window.location.assign(backDestination(payment).to);
      }
    } catch (err) {
      setRetryError(apiErrorMessage(err, "Impossible de relancer le paiement."));
      setRetrying(false);
    }
  }

  if (!paymentId) {
    return <EmptyState icon={CreditCard} title="Aucun paiement à vérifier" />;
  }

  if (payment?.status === "success") {
    return <Navigate to={successDestination(payment)} replace />;
  }

  if (!payment && checks === 0) {
    return <Spinner label="Vérification de votre paiement…" />;
  }

  if (!payment) {
    return (
      <EmptyState
        icon={XCircle}
        title="Paiement introuvable"
        description={loadError ?? "Connectez-vous avec le compte utilisé pour payer, puis réessayez."}
        action={
          <Link to="/login">
            <Button>Se connecter</Button>
          </Link>
        }
      />
    );
  }

  const back = backDestination(payment);
  const failed = payment.status === "failed" || (providerReportedError && payment.status === "pending");

  if (payment.status === "refunded") {
    return (
      <EmptyState
        icon={CreditCard}
        title="Paiement remboursé"
        description="Ce paiement a été remboursé."
        action={
          <Link to={back.to}>
            <Button variant="secondary">{back.label}</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <h1 className="font-display text-2xl font-bold text-gray-900">Paiement</h1>
      <Card className="flex flex-col items-center gap-4 py-8 text-center">
        {failed ? (
          <>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-danger" />
            </span>
            <p className="font-semibold text-ink">Le paiement n'a pas abouti</p>
            <p className="text-sm text-muted-foreground">
              Aucun montant n'a été validé pour {formatPrice(payment.amount)}. Vous pouvez réessayer, avec le même
              moyen de paiement.
            </p>
          </>
        ) : keepPolling || checks === 0 ? (
          <Spinner label="Confirmation du paiement en cours…" />
        ) : (
          <>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-100">
              <Clock className="h-8 w-8 text-amber-600" />
            </span>
            <p className="font-semibold text-ink">Paiement en cours de confirmation</p>
            <p className="text-sm text-muted-foreground">
              {loadError ??
                "Le fournisseur n'a pas encore confirmé votre paiement. Si vous avez validé l'opération, elle sera prise en compte automatiquement : inutile de payer une seconde fois."}
            </p>
          </>
        )}

        {retryError && <p className="text-sm text-danger">{retryError}</p>}

        <div className="flex flex-wrap justify-center gap-3">
          {failed && (
            <Button onClick={handleRetry} loading={retrying}>
              Réessayer le paiement
            </Button>
          )}
          {!failed && !keepPolling && checks > 0 && (
            <Button
              onClick={() => {
                setChecks(0);
                setLoadError(null);
                void check();
              }}
            >
              Vérifier à nouveau
            </Button>
          )}
          <Link to={back.to}>
            <Button variant="secondary">{back.label}</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
