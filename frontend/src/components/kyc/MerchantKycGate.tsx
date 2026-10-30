import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Home, ShieldCheck, Store as StoreIcon } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import * as kycApi from "@/api/kyc";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { KycStatusCard } from "@/components/kyc/KycStatusCard";
import { DashboardShell, type DashboardNavItem } from "@/components/layout/DashboardShell";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { Logo } from "@/components/brand/Logo";
import CreateShopPage from "@/pages/create-shop";
import type { SellerKyc, Store } from "@/types";

/**
 * Parcours vendeur : la boutique d'abord, puis la pièce d'identité (ces
 * écrans bloquent l'espace tant qu'elles manquent). L'administration valide
 * les deux en une seule décision ; en attendant, le vendeur prépare ses
 * produits en brouillon. L'API bloque de son côté la vente sans validation.
 */
async function fetchOwnKyc(): Promise<SellerKyc | null> {
  try {
    return await kycApi.getMySellerKyc();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

async function fetchDossier(): Promise<{ kyc: SellerKyc | null; store: Store | null }> {
  const [kyc, stores] = await Promise.all([fetchOwnKyc(), catalogApi.listMyStores()]);
  return { kyc, store: stores[0] ?? null };
}

type Step = "store" | "identity";

const STEPS: { key: Step | "review"; icon: typeof StoreIcon; title: string; detail: string }[] = [
  { key: "store", icon: StoreIcon, title: "1. Boutique", detail: "Nom, téléphone, catégorie" },
  { key: "identity", icon: ShieldCheck, title: "2. Identité", detail: "Recto et verso de votre pièce" },
  { key: "review", icon: CheckCircle2, title: "Validation", detail: "Par l'administration (≤ 24 h)" },
];

function Onboarding({
  badge,
  subtitle,
  step,
  children,
}: {
  badge: string;
  subtitle: string;
  step?: Step;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-4">
        <Logo />
        <span className="inline-flex items-center gap-2 rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange-dark">
          <ShieldCheck className="h-4 w-4" />
          {badge}
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-extrabold text-ink">Espace vendeur</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {step && (
          <ol className="mb-5 grid gap-2 rounded-2xl border border-border bg-white p-4 text-sm sm:grid-cols-3">
            {STEPS.map(({ key, icon: Icon, title, detail }) => (
              <li
                key={key}
                className={cn("flex items-start gap-2", key === step ? "text-orange-dark" : "text-muted-foreground")}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="block">{title}</strong>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
        {children}
        {step && (
          <p className="mt-3 rounded-xl border border-orange/20 bg-orange/5 px-4 py-3 text-xs text-muted-foreground">
            Pendant l&apos;examen, vous pourrez préparer vos produits : ils seront mis en ligne dès la validation, et
            votre essai gratuit de 30 jours commencera ce jour-là.
          </p>
        )}
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

export function MerchantKycGate({ nav, title }: { nav: DashboardNavItem[]; title: string }) {
  const { data, loading, error, refetch } = useAsync(fetchDossier, []);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted">
        <Spinner label="Vérification de votre dossier…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-muted p-6">
        <ErrorState onRetry={refetch} />
      </div>
    );
  }

  const kycStatus = data.kyc?.status ?? null;

  if (kycStatus === "SUSPENDED" || kycStatus === "BLOCKED") {
    return (
      <Onboarding badge="Compte vendeur restreint" subtitle="Votre compte vendeur est restreint.">
        <KycStatusCard kind="seller" onSubmitted={refetch} />
      </Onboarding>
    );
  }

  if (!data.store) {
    return (
      <Onboarding
        badge="Étape 1 sur 2 — votre boutique"
        subtitle="Bienvenue ! Créez votre boutique, puis envoyez votre pièce d'identité."
        step="store"
      >
        <CreateShopPage onDone={refetch} />
      </Onboarding>
    );
  }

  // Pièce pas encore envoyée (ou refusée) : dernière étape avant l'examen.
  if (kycStatus === null || kycStatus === "PENDING" || kycStatus === "REJECTED") {
    return (
      <Onboarding
        badge="Étape 2 sur 2 — votre identité"
        subtitle={
          kycStatus === "REJECTED"
            ? "Votre dossier est à corriger. Renvoyez votre pièce d'identité : il repartira aussitôt en examen."
            : "Votre boutique est créée. Envoyez votre pièce d'identité : l'administration examinera les deux ensemble."
        }
        step="identity"
      >
        <KycStatusCard kind="seller" onSubmitted={refetch} />
      </Onboarding>
    );
  }

  return <DashboardShell nav={nav} title={title} />;
}
