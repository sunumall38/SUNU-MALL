import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Store as StoreIcon, TriangleAlert } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import type { Store } from "@/types";

const schema = z.object({
  name: z.string().min(2, "Nom de boutique requis"),
  phone: z.string().min(6, "Téléphone requis"),
  category: z.string().min(1, "Catégorie requise"),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Refusée par l'administration, en attente de corrections (cf. Store.is_rejected côté backend). */
function isRejected(store: Store) {
  return store.status === "suspended" && Boolean(store.rejection_reason);
}

function errorMessage(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return "Impossible de contacter le serveur.";
  const data = (err.data ?? {}) as Record<string, unknown>;
  const first = Object.values(data)[0];
  if (Array.isArray(first)) return String(first[0]);
  if (typeof first === "string") return first;
  return fallback;
}

/** `onDone` : écran d'accueil de l'espace vendeur, qui passe à l'étape suivante. */
export default function CreateShopPage({ onDone }: { onDone?: () => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { data: categories } = useAsync(() => catalogApi.listStoreCategories(), []);
  // 1 vendeur = 1 boutique : si elle existe déjà, cette page ne sert qu'à la
  // corriger après un refus.
  const { data: myStores, loading: loadingStores } = useAsync(() => catalogApi.listMyStores(), []);
  const existing = myStores?.[0] ?? null;
  const editing = existing !== null && isRejected(existing);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!editing || !existing) return;
    reset({
      name: existing.name,
      phone: existing.phone ?? "",
      category: existing.category ? String(existing.category) : "",
      description: existing.description ?? "",
      address: existing.address ?? "",
      city: existing.city ?? "",
    });
  }, [editing, existing, reset, categories]);

  async function onSubmit(values: FormValues) {
    setError(null);
    const payload = {
      name: values.name,
      phone: values.phone,
      category: values.category ? Number(values.category) : null,
      description: values.description,
      address: values.address,
      city: values.city,
    };
    try {
      if (editing && existing) await catalogApi.updateStore(existing.id, payload);
      else await catalogApi.createStore(payload);
      if (onDone) onDone();
      else navigate("/merchant");
    } catch (err) {
      setError(errorMessage(err, editing ? "Impossible d'enregistrer la boutique." : "Impossible de créer la boutique."));
    }
  }

  if (loadingStores) return <Spinner label="Chargement…" />;
  if (existing && !editing) return <Navigate to="/merchant" replace />;

  return (
    // Dans l'écran d'accueil de l'espace vendeur, le formulaire prend toute sa largeur.
    <div className={onDone ? undefined : "max-w-lg"}>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-orange">
          <StoreIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">{editing ? "Corriger ma boutique" : "Créer ma boutique"}</h1>
          <p className="text-sm text-muted-foreground">
            {editing
              ? "Après enregistrement, votre dossier repart en examen."
              : "Vous enverrez ensuite votre pièce d'identité : l'administration examinera les deux ensemble."}
          </p>
        </div>
      </div>
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {editing && existing?.rejection_reason && (
            <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Motif du refus : {existing.rejection_reason}</span>
            </div>
          )}
          <Input label="Nom de la boutique" {...register("name")} error={errors.name?.message} />
          <Input label="Téléphone" {...register("phone")} error={errors.phone?.message} placeholder="77 000 00 00" />
          <Select label="Catégorie" {...register("category")} error={errors.category?.message}>
            <option value="">Sélectionner…</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Textarea
            label="Description de votre activité (optionnel)"
            {...register("description")}
            placeholder="Ce que vous vendez, votre expérience…"
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Adresse (optionnel)" {...register("address")} />
            <Input label="Ville (optionnel)" {...register("city")} placeholder="Dakar" />
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" loading={isSubmitting}>
            {editing ? "Renvoyer mon dossier" : "Créer la boutique"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
