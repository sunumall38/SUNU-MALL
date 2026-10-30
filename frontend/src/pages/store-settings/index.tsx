import { useEffect, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, MapPin, Settings, Store as StoreIcon, TriangleAlert } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];

interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}
type BusinessHours = Record<string, DayHours>;

const DEFAULT_HOURS: DayHours = { closed: false, open: "08:00", close: "19:00" };

export default function StoreSettingsPage() {
  const { data: own, loading: loadingStores, refetch: refetchStores } = useAsync(() => catalogApi.listMyStores(), []);
  const [storeId, setStoreId] = useState<string>("");
  const selectedStore = own?.find((s) => s.id === storeId);
  const [locating, setLocating] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!storeId && own && own.length > 0) setStoreId(own[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [own?.length]);

  const {
    data: settings,
    loading: loadingSettings,
    refetch,
  } = useAsync(() => (storeId ? catalogApi.getStoreSettings(storeId) : Promise.resolve(null)), [storeId]);

  const [hours, setHours] = useState<BusinessHours>({});
  const [minOrder, setMinOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    const raw = (settings.business_hours ?? {}) as Partial<BusinessHours>;
    const normalized: BusinessHours = {};
    for (const day of DAYS) {
      normalized[day.key] = raw[day.key] ?? { ...DEFAULT_HOURS };
    }
    setHours(normalized);
    setMinOrder(settings.min_order_amount);
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      await catalogApi.updateStoreSettings(storeId, {
        business_hours: hours,
        min_order_amount: parseFloat(minOrder) || 0,
      });
      setFeedback({ type: "success", text: "Paramètres enregistrés." });
      refetch();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof ApiError ? "Impossible d'enregistrer." : "Impossible de contacter le serveur.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !storeId) return;
    setUploadingLogo(true);
    setLogoError(null);
    try {
      await catalogApi.uploadStoreLogo(storeId, file);
      refetchStores();
    } catch {
      setLogoError("Impossible d'enregistrer la photo. Réessayez.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !storeId) return;
    setUploadingBanner(true);
    setBannerError(null);
    try {
      await catalogApi.uploadStoreBanner(storeId, file);
      refetchStores();
    } catch {
      setBannerError("Impossible d'enregistrer la photo. Réessayez.");
    } finally {
      setUploadingBanner(false);
    }
  }

  function handleUseMyPosition() {
    if (!navigator.geolocation) {
      setLocationFeedback({ type: "error", text: "Géolocalisation non disponible sur cet appareil." });
      return;
    }
    setLocating(true);
    setLocationFeedback(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await catalogApi.updateStorePosition(storeId, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLocationFeedback({ type: "success", text: "Position de la boutique enregistrée." });
          refetchStores();
        } catch {
          setLocationFeedback({ type: "error", text: "Impossible d'enregistrer la position." });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationFeedback({ type: "error", text: "Impossible d'obtenir votre position." });
        setLocating(false);
      },
    );
  }

  if (loadingStores) return <Spinner label="Chargement…" />;
  if (!own || own.length === 0) {
    return <EmptyState icon={StoreIcon} title="Aucune boutique" description="Créez d'abord votre boutique pour configurer ses paramètres." />;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 flex items-center gap-2 font-display text-2xl font-bold text-gray-900">
        <Settings className="h-6 w-6 text-orange" /> Paramètres boutique
      </h1>

      {own.length > 1 && (
        <div className="mb-4 max-w-xs">
          <Select label="Boutique" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {own.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {loadingSettings ? (
        <Spinner label="Chargement des paramètres…" />
      ) : (
        <Card className="flex flex-col gap-5">
          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Photo de profil de la boutique</p>
            <div className="flex items-center gap-4">
              <label
                htmlFor="store-logo"
                className="focus-ring relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-border bg-muted transition-colors hover:border-orange/50"
              >
                {selectedStore?.logo_url ? (
                  <img src={selectedStore.logo_url} alt={selectedStore.name} className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
                {uploadingLogo && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                )}
              </label>
              <input
                id="store-logo"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                disabled={uploadingLogo}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground">
                Visible sur votre fiche boutique et dans l'annuaire des boutiques. JPG ou PNG.
              </p>
            </div>
            {logoError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {logoError}
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Photo de couverture de la boutique</p>
            <label
              htmlFor="store-banner"
              className="focus-ring relative grid h-28 w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted transition-colors hover:border-orange/50"
            >
              {selectedStore?.banner_url ? (
                <img src={selectedStore.banner_url} alt={selectedStore.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">Ajouter une photo de couverture</span>
                </div>
              )}
              {uploadingBanner && (
                <div className="absolute inset-0 grid place-items-center bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </label>
            <input
              id="store-banner"
              type="file"
              accept="image/*"
              onChange={handleBannerChange}
              disabled={uploadingBanner}
              className="hidden"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Affichée en arrière-plan de votre fiche boutique et de sa carte dans l'annuaire.
            </p>
            {bannerError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                {bannerError}
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Localisation de la boutique</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Indispensable pour livrer : seuls les livreurs proches de cette position peuvent récupérer vos colis, et
              elle sert à calculer les frais de livraison. Enregistrez-la depuis la boutique elle-même.
            </p>
            {selectedStore?.latitude && selectedStore?.longitude ? (
              <p className="mb-3 flex items-center gap-1.5 text-sm text-ink">
                <MapPin className="h-4 w-4 text-orange" />
                Position enregistrée ({parseFloat(selectedStore.latitude).toFixed(4)}, {parseFloat(selectedStore.longitude).toFixed(4)})
              </p>
            ) : (
              <p className="mb-3 text-sm text-muted-foreground">Aucune position enregistrée pour l'instant.</p>
            )}
            <Button variant="secondary" onClick={handleUseMyPosition} loading={locating}>
              <MapPin className="h-4 w-4" />
              Utiliser ma position actuelle
            </Button>
            {locationFeedback && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium",
                  locationFeedback.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-danger/30 bg-red-50 text-danger",
                )}
              >
                {locationFeedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
                {locationFeedback.text}
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold text-ink">Horaires d'ouverture</p>
            <div className="flex flex-col gap-2">
              {DAYS.map((day) => {
                const dayHours = hours[day.key] ?? DEFAULT_HOURS;
                return (
                  <div key={day.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <label className="flex w-28 shrink-0 items-center gap-2 text-sm font-medium text-ink">
                      <input
                        type="checkbox"
                        checked={!dayHours.closed}
                        onChange={(e) => setHours((h) => ({ ...h, [day.key]: { ...dayHours, closed: !e.target.checked } }))}
                        className="h-4 w-4 accent-orange"
                      />
                      {day.label}
                    </label>
                    {!dayHours.closed ? (
                      <div className="flex items-center gap-2 text-sm">
                        <input
                          type="time"
                          value={dayHours.open}
                          onChange={(e) => setHours((h) => ({ ...h, [day.key]: { ...dayHours, open: e.target.value } }))}
                          className="focus-ring rounded-md border border-border px-2 py-1"
                        />
                        <span className="text-muted-foreground">à</span>
                        <input
                          type="time"
                          value={dayHours.close}
                          onChange={(e) => setHours((h) => ({ ...h, [day.key]: { ...dayHours, close: e.target.value } }))}
                          className="focus-ring rounded-md border border-border px-2 py-1"
                        />
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Fermé</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="Montant minimum de commande (XOF)"
            type="number"
            step="1"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            className="max-w-xs"
          />

          {feedback && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium",
                feedback.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-danger/30 bg-red-50 text-danger",
              )}
            >
              {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <TriangleAlert className="h-4 w-4 shrink-0" />}
              {feedback.text}
            </div>
          )}

          <Button onClick={handleSave} loading={saving} className="self-start">
            Enregistrer
          </Button>
        </Card>
      )}
    </div>
  );
}
