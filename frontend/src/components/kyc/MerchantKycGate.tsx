import { Link } from "react-router-dom";
import { CheckCircle2, Home, ShieldCheck } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as kycApi from "@/api/kyc";
import * as catalogApi from "@/api/catalog";
import { ApiError } from "@/lib/api";
import { KycStatusCard } from "@/components/kyc/KycStatusCard";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/DashboardShell";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { Logo } from "@/components/brand/Logo";
import type { SellerKyc, Store } from "@/types";

/**
 * Le vendeur crée d'abord sa boutique et attend sa validation. Une fois la
 * boutique approuvée, le KYC devient la dernière étape obligatoire avant la
 * vente. L'API continue de bloquer publication et retraits sans KYC vérifié.
 */
async function fetchOwnKyc(): Promise<SellerKyc | null> {
  try {
    return await kycApi.getMySellerKyc();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

interface MerchantAccessState {
  kyc: SellerKyc | null;
  stores: Store[];
}

async function fetchMerchantAccess(): Promise<MerchantAccessState> {
  const [kyc, stores] = await Promise.all([fetchOwnKyc(), catalogApi.listMyStores()]);
  return { kyc, stores };
}

export function MerchantKycGate({ nav, title }: { nav: DashboardNavItem[]; title: string }) {
  const { data, loading, error, refetch } = useAsync<MerchantAccessState>(fetchMerchantAccess, []);

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

  const verified = data?.kyc?.status === "VERIFIED";
  const hasApprovedStore = data?.stores.some((store) => store.status === "active") ?? false;

  if (hasApprovedStore && !verified) {
    return (
      <div className="min-h-screen bg-muted">
        <header className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
          <Logo />
          <span className="inline-flex items-center gap-2 rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange-dark">
            <ShieldCheck className="h-4 w-4" />
            Étape 3 sur 3 — identité à vérifier
          </span>
        </header>
        <main className="mx-auto w-full max-w-2xl px-4 py-10">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-extrabold text-ink">Espace vendeur</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Votre boutique est approuvée. Envoyez maintenant votre pièce d'identité pour activer la vente
              et débloquer toutes les fonctions de votre espace (délai indicatif : ≤ 24 h).
            </p>
          </div>
          <ol className="mb-5 grid gap-2 rounded-2xl border border-border bg-white p-4 text-sm sm:grid-cols-3">
            <li className="flex items-start gap-2 text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">1. Compte activé</strong><span className="text-xs text-muted-foreground">Téléphone ou e-mail vérifié</span></span>
            </li>
            <li className="flex items-start gap-2 text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">2. Boutique approuvée</strong><span className="text-xs text-muted-foreground">Validée par l'administration</span></span>
            </li>
            <li className="flex items-start gap-2 text-orange-dark">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong className="block">3. Identité</strong><span className="text-xs text-muted-foreground">Documents à valider</span></span>
            </li>
          </ol>
          <KycStatusCard kind="seller" />
          <p className="mt-3 rounded-xl border border-orange/20 bg-orange/5 px-4 py-3 text-xs text-muted-foreground">
            Votre boutique est déjà validée. Dès que l'administration approuve votre identité, vous pourrez publier
            des produits, recevoir des commandes et utiliser les fonctions financières.
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
