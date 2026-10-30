import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ImagePlus, Store as StoreIcon, TriangleAlert } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import * as monetizationApi from "@/api/monetization";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { ApiError } from "@/lib/api";
import { ProductLimitBanner } from "@/components/merchant/ProductLimitBanner";

const schema = z.object({
  store: z.string().min(1, "Boutique requise"),
  category: z.string().optional(),
  name: z.string().min(2, "Nom du produit requis"),
  description: z.string().optional(),
  base_price: z.coerce.number().positive("Prix invalide"),
  sku: z.string().optional(),
  initial_quantity: z.coerce.number().int().min(0).default(100),
});
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export default function AddProductPage() {
  const navigate = useNavigate();
  const { data: own, loading: loadingStores } = useAsync(() => catalogApi.listMyStores(), []);
  const { data: categories } = useAsync(() => catalogApi.listCategories(), []);
  const { data: account } = useAsync(() => monetizationApi.getMySubscriptionState(), []);
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Catégories principales seulement : les pages clients n'affichent pas les
  // sous-catégories, un produit classé dedans y serait introuvable.
  const mainCategories = categories?.filter((c) => !c.parent) ?? [];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { initial_quantity: 100 } });

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const product = await catalogApi.createProduct({
        store: values.store,
        category: values.category || null,
        name: values.name,
        description: values.description,
        base_price: values.base_price,
        status: "active",
      });
      await catalogApi.createVariant({
        product: product.id,
        ...(values.sku?.trim() ? { sku: values.sku.trim() } : {}),
        price: Number(values.base_price),
        initial_quantity: values.initial_quantity,
      });
      if (imageFile) {
        await catalogApi.uploadProductImage(product.id, imageFile);
      }
      navigate("/catalog");
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as Record<string, unknown>;
        if (typeof data?.detail === "string") {
          setError(data.detail);
        } else {
          const firstError = Object.values(data ?? {})[0];
          setError(Array.isArray(firstError) ? String(firstError[0]) : "Impossible de créer le produit.");
        }
      } else {
        setError("Impossible de contacter le serveur.");
      }
    }
  }

  if (loadingStores) return <Spinner label="Chargement…" />;

  if (!own || own.length === 0) {
    return (
      <EmptyState icon={StoreIcon} title="Créez d'abord votre boutique" description="Vous devez avoir une boutique avant de pouvoir ajouter des produits." />
    );
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 font-display text-2xl font-bold text-gray-900">Ajouter un produit</h1>
      <ProductLimitBanner account={account} className="mb-4" />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <p className="mb-1.5 text-sm font-semibold text-ink">Photo</p>
            <label
              htmlFor="product-image"
              className="focus-ring grid aspect-square w-32 cursor-pointer place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-muted transition-colors hover:border-orange/50"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Aperçu" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              )}
            </label>
            <input id="product-image" type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </div>

          <Select label="Boutique" {...register("store")} error={errors.store?.message}>
            <option value="">Sélectionner…</option>
            {own.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
          <Input label="Nom du produit" {...register("name")} error={errors.name?.message} />
          <Textarea label="Description" {...register("description")} rows={3} />
          <Select label="Catégorie" {...register("category")}>
            <option value="">Sélectionner…</option>
            {mainCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Prix (XOF)" type="number" step="1" {...register("base_price")} error={errors.base_price?.message} />
            <Input
              label="Stock initial"
              type="number"
              step="1"
              {...register("initial_quantity")}
              error={errors.initial_quantity?.message}
            />
          </div>
          <Input
            label="Référence interne (facultatif)"
            placeholder="Votre propre code, ex. REF-001"
            {...register("sku")}
            error={errors.sku?.message}
          />
          <p className="-mt-1 text-[11px] text-muted-foreground">
            Pour votre gestion de stock — laissez vide pour qu&apos;un code soit généré automatiquement.
          </p>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" loading={isSubmitting}>
            Publier le produit
          </Button>
        </form>
      </Card>
    </div>
  );
}
