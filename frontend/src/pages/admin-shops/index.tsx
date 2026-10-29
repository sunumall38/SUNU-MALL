import { useState } from "react";
import { CheckCircle2, MapPin, Phone, Store as StoreIcon, Tag } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import { ApiError } from "@/lib/api";
import { SellerIdentitySummary } from "@/components/kyc/SellerIdentitySummary";
import { Modal } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { formatDate } from "@/lib/utils";
import type { Store } from "@/types";

const PAGE_SIZE = 20;

export default function AdminShopsPage() {
  const [pendingPage, setPendingPage] = useState(1);
  const [allPage, setAllPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ storeId: string; message: string } | null>(null);
  const [rejecting, setRejecting] = useState<Store | null>(null);
  const [reason, setReason] = useState("");
  const [identityRejected, setIdentityRejected] = useState(true);

  const {
    data: pendingResult,
    loading: loadingPending,
    error: pendingError,
    refetch: refetchPending,
  } = useAsync(() => catalogApi.listStoresPaginated({ status: "inactive", page: pendingPage }), [pendingPage]);
  const {
    data: allResult,
    loading: loadingAll,
    error: allError,
    refetch: refetchAll,
  } = useAsync(() => catalogApi.listStoresPaginated({ page: allPage }), [allPage]);

  const pending = pendingResult?.results ?? [];
  const pendingTotalPages = pendingResult ? Math.max(1, Math.ceil(pendingResult.count / PAGE_SIZE)) : 1;
  const all = allResult?.results ?? [];
  const allTotalPages = allResult ? Math.max(1, Math.ceil(allResult.count / PAGE_SIZE)) : 1;

  function refetchBoth() {
    refetchPending();
    refetchAll();
  }

  function failure(storeId: string, err: unknown) {
    const detail = err instanceof ApiError ? (err.data as { detail?: string } | null)?.detail : undefined;
    setActionError({ storeId, message: detail ?? "L'action a échoué. Réessayez." });
  }

  async function approve(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await catalogApi.approveStore(id);
      refetchBoth();
    } catch (err) {
      failure(id, err);
    } finally {
      setBusy(null);
    }
  }

  function openReject(store: Store) {
    setReason("");
    setIdentityRejected(true);
    setActionError(null);
    setRejecting(store);
  }

  async function confirmReject() {
    if (!rejecting || !reason.trim()) return;
    const id = rejecting.id;
    setBusy(id);
    try {
      await catalogApi.rejectStore(id, reason.trim(), identityRejected);
      setRejecting(null);
      refetchBoth();
    } catch (err) {
      setRejecting(null);
      failure(id, err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-4 flex items-center gap-2 font-display text-2xl font-bold text-gray-900">
          <StoreIcon className="h-6 w-6 text-orange" /> Validation des vendeurs
        </h1>
        <p className="-mt-2 mb-4 text-sm text-muted-foreground">
          Une seule décision par dossier : valider active la boutique et vérifie l'identité du vendeur.
        </p>
        {loadingPending ? (
          <Spinner label="Chargement…" />
        ) : pendingError ? (
          <ErrorState onRetry={refetchPending} />
        ) : pending.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Aucune demande en attente" description="Toutes les boutiques ont été traitées." />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {pending.map((store) => (
                <Card key={store.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {store.logo_url ? (
                        <img src={store.logo_url} alt={store.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-accent text-orange">
                          <StoreIcon className="h-5 w-5" />
                        </span>
                      )}
                      <div>
                        <p className="font-semibold text-ink">{store.name}</p>
                        <p className="text-sm text-muted-foreground">{store.owner_email}</p>
                        <p className="text-xs text-muted-foreground">Demande soumise le {formatDate(store.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" loading={busy === store.id} onClick={() => approve(store.id)}>
                        Valider le dossier
                      </Button>
                      <Button size="sm" variant="danger" loading={busy === store.id} onClick={() => openReject(store)}>
                        Refuser
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-border pt-3 text-sm text-ink">
                    <span className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {store.phone || <span className="text-muted-foreground">Non renseigné</span>}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                      {store.category_detail?.name ?? <span className="text-muted-foreground">Non renseignée</span>}
                    </span>
                    {(store.address || store.city) && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {[store.address, store.city].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                  {store.description && <p className="text-sm text-ink/80">{store.description}</p>}
                  <SellerIdentitySummary sellerId={store.owner} />
                  {actionError?.storeId === store.id && (
                    <p className="rounded-lg bg-red-50 p-2 text-sm text-danger">{actionError.message}</p>
                  )}
                </Card>
              ))}
            </div>
            <Pagination page={pendingPage} totalPages={pendingTotalPages} onPageChange={setPendingPage} className="mt-4" />
          </>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-display text-lg font-bold text-gray-800">Toutes les boutiques</h2>
        {loadingAll ? (
          <Spinner label="Chargement…" />
        ) : allError ? (
          <ErrorState onRetry={refetchAll} />
        ) : all.length === 0 ? (
          <EmptyState icon={StoreIcon} title="Aucune boutique" />
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {all.map((store) => (
                <Card key={store.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-ink">{store.name}</p>
                    <p className="text-sm text-muted-foreground">{store.owner_email}</p>
                  </div>
                  <Badge variant={store.status === "active" ? "success" : store.status === "suspended" ? "danger" : "warning"}>
                    {store.status}
                  </Badge>
                </Card>
              ))}
            </div>
            <Pagination page={allPage} totalPages={allTotalPages} onPageChange={setAllPage} className="mt-4" />
          </>
        )}
      </div>

      {rejecting && (
        <Modal open onClose={() => setRejecting(null)} title="Refuser le dossier">
          <p className="text-sm text-ink">
            Dossier de la boutique « {rejecting.name} ». Le vendeur verra ce motif pour corriger son dossier, qui
            repartira ensuite automatiquement en examen.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Motif du refus (obligatoire)"
            className="mt-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-orange focus:ring-2 focus:ring-orange/20"
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={identityRejected} onChange={(e) => setIdentityRejected(e.target.checked)} />
            La pièce d'identité est aussi à refaire
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejecting(null)}>
              Annuler
            </Button>
            <Button variant="danger" disabled={!reason.trim()} loading={busy === rejecting.id} onClick={confirmReject}>
              Refuser le dossier
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
