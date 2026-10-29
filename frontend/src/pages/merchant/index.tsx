import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Clock,
  Headset,
  ImagePlus,
  Loader2,
  Megaphone,
  Package,
  PlusCircle,
  ShoppingBag,
  Store as StoreIcon,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import * as ordersApi from "@/api/orders";
import * as monetizationApi from "@/api/monetization";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SubscriptionStatusCard } from "@/components/merchant/SubscriptionStatusCard";
import { ProductLimitBanner } from "@/components/merchant/ProductLimitBanner";
import { formatDate, formatPrice } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/api";
import { DELIVERY_STATUS_LABEL } from "@/lib/delivery";
import {
  ASSIGNABLE_ORDER_STATUSES,
  ORDER_STATUS_VARIANT,
  PAID_ORDER_STATUSES,
  orderStatusLabel,
} from "@/lib/orderStatus";
import type { DeliveryStatus, Driver, OrderStatus } from "@/types";

type DashboardOrder = { status: string; delivery_type?: string; delivery: { status: string } | null };

/** Livreur affectable : commande payée, livraison à domicile, pas encore affectée. */
function canAssignDriver(order: DashboardOrder) {
  return (
    ASSIGNABLE_ORDER_STATUSES.has(order.status) &&
    order.delivery_type !== "pickup" &&
    order.delivery?.status === "pending"
  );
}

export default function MerchantDashboardPage() {
  const { data: own, loading: loadingStores, refetch: refetchStores } = useAsync(() => catalogApi.listMyStores(), []);
  const { data: orders, loading: loadingOrders, refetch: refetchOrders } = useAsync(() => ordersApi.listOrders(), []);
  const { data: account } = useAsync(() => monetizationApi.getMySubscriptionState(), []);
  const [assigningDeliveryId, setAssigningDeliveryId] = useState<string | null>(null);
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [logoErrorId, setLogoErrorId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const orderList = useMemo(() => orders ?? [], [orders]);
  const pendingStoreIds = useMemo(
    () => [...new Set(orderList.filter(canAssignDriver).map((o) => o.store))],
    [orderList],
  );
  const [driversByStore, setDriversByStore] = useState<Record<string, Driver[]>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries: Record<string, Driver[]> = {};
      for (const storeId of pendingStoreIds) {
        try {
          entries[storeId] = await ordersApi.listAvailableDrivers(storeId);
        } catch {
          entries[storeId] = [];
        }
      }
      if (!cancelled) setDriversByStore(entries);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [pendingStoreIds]);

  if (loadingStores || loadingOrders) return <Spinner label="Chargement du tableau de bord…" />;
  if (!own) return null;

  // Chiffre d'affaires : commandes encaissées seulement (pas celles en
  // attente de paiement ni annulées).
  const paidOrders = orderList.filter((o) => PAID_ORDER_STATUSES.has(o.status));
  const revenue = paidOrders.reduce((sum, o) => sum + parseFloat(o.total_amount), 0);
  const storeWithoutPosition = own.find((s) => s.status === "active" && (s.latitude == null || s.longitude == null));
  const activeStore = own[0];

  async function assign(deliveryId: string, driverId: string) {
    if (!driverId) return;
    setAssigningDeliveryId(deliveryId);
    setAssignError(null);
    try {
      await ordersApi.assignDriver(deliveryId, driverId);
      refetchOrders();
    } catch (err) {
      setAssignError(apiErrorMessage(err, "Impossible d'affecter ce livreur."));
    } finally {
      setAssigningDeliveryId(null);
    }
  }

  async function handleLogoChange(storeId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingLogoId(storeId);
    setLogoErrorId(null);
    try {
      await catalogApi.uploadStoreLogo(storeId, file);
      refetchStores();
    } catch {
      setLogoErrorId(storeId);
    } finally {
      setUploadingLogoId(null);
    }
  }

  if (own.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <EmptyState
          icon={StoreIcon}
          title="Vous n'avez pas encore de boutique"
          description="Votre pièce d'identité est bien reçue. Créez maintenant votre boutique : l'administration examinera les deux ensemble."
          action={
            <Link to="/create-shop">
              <Button>Créer ma boutique</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl text-ink">Tableau de bord</h1>
        <Link to="/add-product">
          <Button size="sm">
            <PlusCircle className="h-4 w-4" /> Ajouter un produit
          </Button>
        </Link>
      </div>

      {storeWithoutPosition && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-ink"
        >
          <span className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 shrink-0 text-orange-dark" />
            Enregistrez la position de « {storeWithoutPosition.name} » : sans elle, aucun livreur ne peut être affecté
            à vos commandes.
          </span>
          <Link to="/store-settings">
            <Button size="sm" variant="secondary">
              Enregistrer la position
            </Button>
          </Link>
        </div>
      )}

      <SubscriptionStatusCard account={account} />

      {account && !account.has_active_subscription && (
        <ProductLimitBanner account={account} />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Chiffre d'affaires</p>
            <p className="truncate text-lg font-semibold text-ink">{formatPrice(revenue)}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Commandes</p>
            <p className="text-lg font-semibold text-ink">
              {orderList.length}
              {paidOrders.length > 0 && (
                <span className="ml-1 text-xs font-normal text-success">({paidOrders.length} payées)</span>
              )}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs text-muted-foreground">Produits</p>
            <p className="text-lg font-semibold text-ink">
              {account?.product_count ?? 0}
              {account && !account.is_unlimited && account.product_limit != null && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ {account.product_limit}</span>
              )}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
            <StoreIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Boutique</p>
            <p className="truncate text-sm font-semibold text-ink">{activeStore?.name}</p>
            <Badge variant={activeStore?.status === "active" ? "success" : activeStore?.status === "suspended" ? "danger" : "warning"}>
              {activeStore?.status === "active" ? "Active" : activeStore?.status === "suspended" ? "Suspendue" : "En attente"}
            </Badge>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Link to="/offers" className="focus-ring rounded-xl">
          <Card variant="interactive" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Nos offres d'abonnement</p>
              <p className="text-xs text-muted-foreground">Comparez et changez de formule en un clic.</p>
            </div>
          </Card>
        </Link>
        <Link to="/support" className="focus-ring rounded-xl">
          <Card variant="interactive" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-orange">
              <Headset className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Support & assistance</p>
              <p className="text-xs text-muted-foreground">Ouvrez un ticket, suivez vos demandes.</p>
            </div>
          </Card>
        </Link>
      </div>

      {own.map((store) => (
        <Card key={store.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label
                htmlFor={`store-logo-${store.id}`}
                className="focus-ring relative grid h-14 w-14 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border bg-muted transition-colors hover:border-orange/50"
                title="Ajouter / changer le logo de la boutique"
              >
                {store.logo_url ? (
                  <img src={store.logo_url} alt={store.name} className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
                {uploadingLogoId === store.id && (
                  <span className="absolute inset-0 grid place-items-center bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  </span>
                )}
              </label>
              <input
                id={`store-logo-${store.id}`}
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoChange(store.id, e)}
                disabled={uploadingLogoId === store.id}
                className="hidden"
              />
              <div>
                <p className="font-semibold text-ink">{store.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ImagePlus className="h-3 w-3" />
                  {store.logo_url ? "Cliquez sur le logo pour le modifier" : "Ajoutez le logo de votre boutique"}
                </p>
              </div>
            </div>
            <Badge variant={store.status === "active" ? "success" : store.status === "suspended" ? "danger" : "warning"}>
              {store.status === "active" ? "Approuvée" : store.status === "suspended" ? "Rejetée" : "En attente de validation"}
            </Badge>
          </div>
          {logoErrorId === store.id && (
            <p className="flex items-center gap-1.5 text-xs text-danger">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Impossible d'enregistrer le logo. Réessayez.
            </p>
          )}
          {store.status === "inactive" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              Votre dossier (identité et boutique) est en cours d'examen par notre équipe.
            </p>
          )}
          {store.status === "suspended" && store.rejection_reason && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs text-danger">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                Raison : {store.rejection_reason}
              </p>
              <Link to="/create-shop">
                <Button size="sm" variant="secondary">Corriger ma boutique</Button>
              </Link>
            </div>
          )}
        </Card>
      ))}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Dernières commandes</CardTitle>
          <span className="text-xs text-muted-foreground">Suivi des livraisons accessible ici</span>
        </div>
        {assignError && (
          <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
            {assignError}
          </p>
        )}
        {orderList.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={ShoppingBag} title="Aucune commande reçue" />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {orderList.slice(0, 5).map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                <span className="text-muted-foreground">{formatDate(order.created_at)}</span>
                <Badge variant={ORDER_STATUS_VARIANT[order.status as OrderStatus] ?? "default"}>
                  {orderStatusLabel(order.status)}
                </Badge>
                <span className="font-bold text-ink">{formatPrice(order.total_amount)}</span>
                {canAssignDriver(order) && order.delivery ? (
                  <select
                    aria-label="Assigner un livreur"
                    disabled={assigningDeliveryId === order.delivery.id}
                    onChange={(e) => order.delivery && assign(order.delivery.id, e.target.value)}
                    defaultValue=""
                    className="focus-ring rounded-lg border border-border px-2 py-1.5 text-xs transition-colors hover:border-orange/50"
                  >
                    <option value="" disabled>
                      Affecter un livreur…
                    </option>
                    {driversByStore[order.store]?.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.full_name}
                        {driver.distance_km != null ? ` — ${driver.distance_km.toFixed(1)} km` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  order.delivery &&
                  PAID_ORDER_STATUSES.has(order.status) && (
                    <Badge variant="default">
                      {order.delivery_type === "pickup"
                        ? "Retrait en boutique"
                        : `Livraison : ${DELIVERY_STATUS_LABEL[order.delivery.status as DeliveryStatus] ?? order.delivery.status}`}
                    </Badge>
                  )
                )}
                <Link
                  to={`/order-detail?order=${order.id}`}
                  aria-label="Voir le détail de la commande"
                  className="focus-ring rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-orange"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
