import { useEffect, useState } from "react";
import { Building2, Check, Copy, KeyRound, Landmark } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as partnerApi from "@/api/partner";
import { apiErrorMessage, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import type { DeliveryPartnerDetail, PartnerPayoutMethod, PartnerStatus } from "@/types";

const STATUS_LABEL: Record<PartnerStatus, string> = {
  active: "Active",
  inactive: "En attente d'activation",
  suspended: "Suspendue",
};

const PAYOUT_METHODS: { id: PartnerPayoutMethod; label: string; accountLabel: string; placeholder: string }[] = [
  { id: "wave", label: "Wave", accountLabel: "Numéro Wave", placeholder: "77 123 45 67" },
  { id: "orange_money", label: "Orange Money", accountLabel: "Numéro Orange Money", placeholder: "77 123 45 67" },
  { id: "bank_transfer", label: "Virement bancaire", accountLabel: "IBAN", placeholder: "SN04 SN01 0015 2000 0000 1234 5678" },
];

function PayoutCard() {
  const { data: payout, loading, error, refetch } = useAsync(() => partnerApi.getPartnerPayout(), []);
  const [method, setMethod] = useState<PartnerPayoutMethod>("wave");
  const [account, setAccount] = useState("");
  const [holder, setHolder] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!payout) return;
    if (payout.payout_method) setMethod(payout.payout_method);
    setAccount(payout.payout_account);
    setHolder(payout.payout_holder);
  }, [payout]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await partnerApi.updatePartnerPayout({
        payout_method: method,
        payout_account: account,
        payout_holder: holder,
        current_password: password,
      });
      setPassword("");
      setMessage({ ok: true, text: "Coordonnées enregistrées. Une confirmation vous a été envoyée par e-mail." });
      refetch();
    } catch (err) {
      setMessage({ ok: false, text: apiErrorMessage(err, "Impossible d'enregistrer les coordonnées.") });
    } finally {
      setSaving(false);
    }
  }

  const current = PAYOUT_METHODS.find((m) => m.id === method) ?? PAYOUT_METHODS[0];

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <Landmark className="h-4 w-4 text-orange" /> Versement de vos factures
      </h2>
      <p className="text-sm text-muted-foreground">
        Sunu Mall verse chaque facture mensuelle sur ce compte. Sans coordonnées, le versement ne peut pas être effectué.
      </p>
      {loading ? (
        <Spinner label="Chargement…" />
      ) : error ? (
        <ErrorState onRetry={refetch} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Moyen de versement">
            {PAYOUT_METHODS.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={method === m.id ? "primary" : "secondary"}
                role="radio"
                aria-checked={method === m.id}
                onClick={() => setMethod(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
          <Input label={current.accountLabel} value={account} onChange={(e) => setAccount(e.target.value)} placeholder={current.placeholder} />
          <Input label="Titulaire du compte" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nom de l'entreprise ou du gérant" />
          <Input
            label="Votre mot de passe"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Demandé à chaque modification, pour protéger vos versements."
          />
          {message && (
            <p
              className={
                message.ok
                  ? "flex items-center gap-2 rounded-lg border border-success/30 bg-green-50 px-3 py-2 text-sm text-success"
                  : "rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger"
              }
            >
              {message.ok && <Check className="h-4 w-4" />} {message.text}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={save} loading={saving} disabled={!account.trim() || !holder.trim() || !password}>
              Enregistrer les coordonnées
            </Button>
            {payout?.payout_updated_at && (
              <span className="text-xs text-muted-foreground">Dernière modification le {formatDate(payout.payout_updated_at)}</span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export default function PartnerProfilePage() {
  const { data: partner, loading, refetch } = useAsync(() => partnerApi.getPartnerProfile(), []);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function initForm(p: DeliveryPartnerDetail) {
    setForm({
      contact_name: p.contact_name,
      contact_email: p.contact_email,
      contact_phone: p.contact_phone,
      address: p.address,
      city: p.city,
    });
  }

  useEffect(() => {
    if (partner && Object.keys(form).length === 0) initForm(partner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner]);

  function update(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await partnerApi.updatePartnerProfile({
        contact_name: form.contact_name,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        address: form.address,
        city: form.city,
      });
      setSaveSuccess(true);
      refetch();
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Impossible d'enregistrer le profil."));
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    setRotating(true);
    setApiKey(null);
    setApiKeyError(null);
    try {
      const result = await partnerApi.rotatePartnerApiKey();
      setApiKey(result.api_key);
    } catch (err) {
      setApiKeyError(err instanceof ApiError ? apiErrorMessage(err, "Impossible de régénérer la clé.") : "Impossible de régénérer la clé.");
    } finally {
      setRotating(false);
    }
  }

  async function copyKey() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (loading) return <Spinner label="Chargement du profil…" />;
  if (!partner) return <ErrorState fullPage />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-gray-900">
          <Building2 className="h-6 w-6 text-orange" /> Mon entreprise
        </h1>
        <Badge variant={partner.status === "active" ? "success" : partner.status === "suspended" ? "danger" : "warning"}>
          {STATUS_LABEL[partner.status]}
        </Badge>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="font-semibold text-ink">Informations de contact</h2>
        <Input label="Personne de contact" value={form.contact_name} onChange={(e) => update("contact_name", e.target.value)} />
        <Input label="Email de contact" type="email" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} />
        <Input label="Téléphone" type="tel" value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} placeholder="+221..." />
        <Input label="Adresse" value={form.address} onChange={(e) => update("address", e.target.value)} />
        <Input label="Ville" value={form.city} onChange={(e) => update("city", e.target.value)} />

        {saveError && <p className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">{saveError}</p>}
        {saveSuccess && (
          <p className="flex items-center gap-2 rounded-lg border border-success/30 bg-green-50 px-3 py-2 text-sm text-success">
            <Check className="h-4 w-4" /> Profil enregistré.
          </p>
        )}
        <Button onClick={save} loading={saving} className="self-start">
          Enregistrer les modifications
        </Button>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <KeyRound className="h-4 w-4 text-orange" /> Clé d'API d'intégration
        </h2>
        <p className="text-sm text-muted-foreground">
          Pour vos échanges machine ↔ machine. La clé n'est affichée qu'une seule fois à la génération ; l'ancienne est invalidée.
        </p>
        {apiKeyError && <p className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">{apiKeyError}</p>}
        {apiKey && (
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 font-mono text-sm text-ink">
              {apiKey}
            </code>
            <Button variant="secondary" size="sm" onClick={copyKey} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copié" : "Copier"}
            </Button>
          </div>
        )}
        <Button variant="danger" onClick={rotate} loading={rotating} className="self-start">
          <KeyRound className="h-4 w-4" />
          Régénérer la clé d'API
        </Button>
      </Card>

      <PayoutCard />

      <p className="text-xs text-muted-foreground">Entreprise enregistrée le {formatDate(partner.created_at)}</p>
    </div>
  );
}