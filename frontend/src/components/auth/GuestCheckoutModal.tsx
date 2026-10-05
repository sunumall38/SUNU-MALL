import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, MailCheck, Phone, TriangleAlert, User } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import * as authApi from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useGuestCheckoutStore } from "@/store/guestCheckoutStore";
import { ApiError } from "@/lib/api";

const schema = z.object({
  first_name: z.string().min(1, "Prénom requis"),
  last_name: z.string().optional(),
  phone: z.string().min(6, "Téléphone requis"),
  email: z.string().email("Email invalide"),
});
type FormValues = z.infer<typeof schema>;

export function GuestCheckoutModal() {
  const { isOpen, pendingAction, close } = useGuestCheckoutStore();
  const loginSuccess = useAuthStore((s) => s.loginSuccess);
  const [conflict, setConflict] = useState(false);
  const [linkSentMessage, setLinkSentMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function handleClose() {
    reset();
    setConflict(false);
    setLinkSentMessage(null);
    close();
  }

  async function onSubmit(values: FormValues) {
    setConflict(false);
    try {
      const data = await authApi.guestCheckout(values);
      if ("login_link_sent" in data) {
        // Client invité déjà connu : il continue via le lien reçu par email.
        setLinkSentMessage(data.message);
        return;
      }
      loginSuccess(data);
      await pendingAction?.();
      reset();
      close();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setConflict(true);
      }
    }
  }

  if (linkSentMessage) {
    return (
      <Modal open={isOpen} onClose={handleClose} title="Vérifiez votre boîte mail" size="sm">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-green-100">
            <MailCheck className="h-7 w-7 text-success" />
          </span>
          <p className="text-sm text-muted-foreground">{linkSentMessage}</p>
          <p className="text-xs text-muted-foreground">
            Le lien est valable quelques minutes. Votre panier est conservé.
          </p>
          <Button onClick={handleClose} className="mt-2 w-full">
            J'ai compris
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={isOpen} onClose={handleClose} title="Vos coordonnées" size="sm">
      <p className="mb-4 text-sm text-muted-foreground">
        Pas besoin de créer un compte pour l'instant — juste de quoi vous livrer et vous confirmer votre commande.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <Input label="Prénom" icon={User} {...register("first_name")} error={errors.first_name?.message} />
        <Input label="Nom (optionnel)" {...register("last_name")} />
        <Input label="Téléphone" icon={Phone} {...register("phone")} error={errors.phone?.message} />
        <Input label="Email" type="email" icon={Mail} {...register("email")} error={errors.email?.message} />

        {conflict && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Cet email est déjà associé à un compte.{" "}
              <Link to="/login" onClick={handleClose} className="font-semibold underline">
                Connectez-vous
              </Link>{" "}
              pour continuer.
            </span>
          </div>
        )}

        <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
          Continuer
        </Button>
      </form>
    </Modal>
  );
}
