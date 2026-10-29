import { Link } from "react-router-dom";
import { CheckCircle2, Home, ShieldCheck, Store as StoreIcon } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as kycApi from "@/api/kyc";
import { ApiError } from "@/lib/api";
import { KycStatusCard } from "@/components/kyc/KycStatusCard";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/DashboardShell";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { Logo } from "@/components/brand/Logo";
import type { SellerKyc } from "@/types";

/**
 * Parcours vendeur : pièce d'identité d'abord (cet écran bloque l'espace
 * tant qu'elle n'est pas envoyée), puis la boutique. L'administration valide
 * les deux en une seule décision. L'API bloque de son côté la création de
 * boutique sans pièce envoyée, et la vente sans validation.
 */
async function fetchOwnKyc(): Promise<SellerKyc | null> {
  try {
    return await kycApi.getMySellerKyc();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function MerchantKycGate({ nav, title }: { nav: DashboardNavItem[]; title: string }) {
  const { data, loading, error, refetch } = useAsync<SellerKyc | null>(fetchOwnKyc, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted">
        <Spinner label="Vérification de votre dossier…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted p-6">
        <ErrorState onRetry={refetch} />
      </div>
    );
  }

  const kycStatus = data?.status ?? null;
  const locked = kycStatus === "SUSPENDED" || kycStatus === "BLOCKED";
  // Tant que la pièce n'est pas envoyée (ou après un refus), l'espace se
  // limite à cet écran ; ensuite, le vendeur peut déposer sa boutique.
  const mustSendIdentity = kycStatus === null || kycStatus === "PENDING" || kycStatus === "REJECTED";

  if (locked || mustSendIdentity) {
    return (
      <div className="min-h-screen bg-muted">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <Logo />
          <span className="inline-flex items-center gap-2 rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange-dark">
            <ShieldCheck className="h-4 w-4" />
            {locked ? "Compte vendeur restreint" : "Étape 1 sur 2 — votre identité"}
          </span>
        </header>
        <main className="mx-auto w-full max-w-2xl px-4 py-10">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-extrabold text-ink">Espace vendeur</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {kycStatus === "REJECTED"
                ? "Votre dossier est à corriger. Renvoyez votre pièce d'identité : il repartira aussitôt en examen."
                : "Bienvenue ! Envoyez votre pièce d'identité pour pouvoir créer votre boutique."}
            </p>
          </div>
          <ol className="mb-5 grid gap-2 rounded-2xl border border-border bg-white p-4 text-sm sm:grid-cols-3">
            <li className="flex items-start gap-2 text-orange-dark">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">1. Identité</strong><span className="text-xs text-muted-foreground">Recto et verso de votre pièce</span></span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <StoreIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">2. Boutique</strong><span className="text-xs">Nom, téléphone, catégorie</span></span>
            </li>
            <li className="flex items-start gap-2 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">Validation</strong><span className="text-xs">Une seule, par l'administration (≤ 24 h)</span></span>
            </li>
          </ol>
          <KycStatusCard kind="seller" onSubmitted={refetch} />
          <p className="mt-3 rounded-xl border border-orange/20 bg-orange/5 px-4 py-3 text-xs text-muted-foreground">
            Une fois votre identité et votre boutique validées, vous pourrez publier vos produits, recevoir des
            commandes et utiliser les fonctions financières.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-muted"
            >
              <Home className="h-4 w-4 text-orange" />
              Retour vers la page d&apos;accueil
            </Link>
            <p className="text-xs text-muted-foreground">
              Besoin d&apos;aide ?{" "}
              <Link to="/contact" className="font-semibold text-orange transition-colors hover:text-orange-dark">
                Contactez le support
              </Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  return <DashboardShell nav={nav} title={title} />;
}
