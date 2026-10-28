import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import * as monetizationApi from "@/api/monetization";
import type { Product } from "@/types";

const today = new Date().toISOString().slice(0, 10);
const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const schema = z
  .object({
    daily_budget: z.coerce.number().positive("Budget invalide"),
    starts_at: z.string().min(1, "Date de début requise"),
    ends_at: z.string().min(1, "Date de fin requise"),
  })
  .refine((data) => data.ends_at >= data.starts_at, {
    message: "La date de fin doit être après la date de début",
    path: ["ends_at"],
  });
type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export function SponsorProductModal({
  product,
  onClose,
  onCreated,
}: {
  product: Product;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { starts_at: today, ends_at: inTwoWeeks, daily_budget: 2000 },
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      await monetizationApi.createSponsoredProduct({
        product: product.id,
        store: product.store,
        daily_budget: values.daily_budget,
        starts_at: values.starts_at,
        ends_at: values.ends_at,
      });
      onCreated();
      onClose();
    } catch {
      setError("Impossible de créer la campagne de sponsoring.");
    }
  }

  return (
    <Modal open onClose={onClose} title={`Sponsoriser « ${product.name} »`}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Le produit sera mis en avant (badge « Sponsorisé ») sur la marketplace pendant la période choisie.
        </p>
        <Input
          label="Budget quotidien (XOF)"
          type="number"
          step="1"
          {...register("daily_budget")}
          error={errors.daily_budget?.message}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Début" type="date" {...register("starts_at")} error={errors.starts_at?.message} />
          <Input label="Fin" type="date" {...register("ends_at")} error={errors.ends_at?.message} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={isSubmitting}>
          Lancer la campagne
        </Button>
      </form>
    </Modal>
  );
}
