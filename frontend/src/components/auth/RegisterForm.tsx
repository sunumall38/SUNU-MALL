import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Lock, Mail, MessageSquareText, Phone, ShieldCheck, TriangleAlert, User } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/lib/api";
import * as authApi from "@/api/auth";

const schema = z.object({
  first_name: z.string().min(1, "Prénom requis"),
  last_name: z.string().min(1, "Nom requis"),
  email: z.string().email("Email invalide"),
  phone: z.string().min(6, "Numéro de téléphone requis"),
  password: z.string().min(8, "8 caractères minimum"),
  verification_channel: z.enum(["sms", "email"]),
});

type FormValues = z.infer<typeof schema>;

export function RegisterForm({ role }: { role: "client" | "merchant" }) {
  const isMerchant = role === "merchant";
  const [serverError, setServerError] = useState<string | null>(null);
  const [completedChannel, setCompletedChannel] = useState<"sms" | "email" | null>(null);
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { verification_channel: "email" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const response = await authApi.register({ ...values, role_name: role });
      if (response.verification_channel === "sms" && response.phone_verification_token) {
        setPhoneToken(response.phone_verification_token);
      } else {
        setCompletedChannel("email");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as Record<string, unknown>;
        const firstError = Object.values(data ?? {})[0];
        setServerError(Array.isArray(firstError) ? String(firstError[0]) : "Inscription impossible.");
      } else {
        setServerError("Impossible de contacter le serveur.");
      }
    }
  }

  async function verifyOtp() {
    if (!phoneToken || otpCode.length !== 6) return;
    setServerError(null);
    setVerifyingOtp(true);
    try {
      await authApi.verifyRegistrationPhone(phoneToken, otpCode);
      setCompletedChannel("sms");
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as Record<string, unknown>;
        const firstError = Object.values(data ?? {})[0];
        setServerError(Array.isArray(firstError) ? String(firstError[0]) : "Code incorrect ou expiré.");
      } else {
        setServerError("Impossible de contacter le serveur.");
      }
    } finally {
      setVerifyingOtp(false);
    }
  }

  if (completedChannel) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-green-50/60 py-8 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-green-100">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </span>
        <h2 className="font-display text-lg font-bold text-ink">Inscription réussie !</h2>
        {completedChannel === "sms" ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            Votre numéro est vérifié et votre compte est actif. Vous pouvez maintenant vous connecter.
          </p>
        ) : isMerchant ? (
          <p className="max-w-sm text-sm text-muted-foreground">
            Vérifiez votre boîte mail pour activer votre compte, puis connectez-vous : vous pourrez alors
            envoyer votre pièce d'identité pour activer votre boutique (vérification sous 24 h).
          </p>
        ) : (
          <p className="max-w-xs text-sm text-muted-foreground">
            Vérifiez votre boîte mail pour activer votre compte avant de vous connecter.
          </p>
        )}
      </div>
    );
  }

  if (phoneToken) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl bg-orange-50/60 p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-orange-100">
          <MessageSquareText className="h-7 w-7 text-orange" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Code envoyé par SMS</h2>
          <p className="mt-1 text-sm text-muted-foreground">Saisissez le code à 6 chiffres reçu sur votre téléphone.</p>
        </div>
        <Input
          label="Code de vérification"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={otpCode}
          onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {serverError && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {serverError}
          </div>
        )}
        <Button type="button" loading={verifyingOtp} disabled={otpCode.length !== 6} onClick={verifyOtp}>
          Vérifier mon numéro
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Prénom" icon={User} {...register("first_name")} error={errors.first_name?.message} />
        <Input label="Nom" icon={User} {...register("last_name")} error={errors.last_name?.message} />
      </div>
      <Input label="Email" type="email" icon={Mail} {...register("email")} error={errors.email?.message} />
      <Input label="Téléphone" icon={Phone} {...register("phone")} error={errors.phone?.message} />
      <Input label="Mot de passe" type="password" icon={Lock} {...register("password")} error={errors.password?.message} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-ink">Comment souhaitez-vous activer votre compte ?</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3 has-[:checked]:border-orange has-[:checked]:bg-orange-50/50">
          <input type="radio" value="sms" className="mt-1 accent-orange" {...register("verification_channel")} />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Phone className="h-4 w-4" /> Par SMS</span>
            <span className="text-xs text-muted-foreground">Recevoir immédiatement un code à 6 chiffres.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-white p-3 has-[:checked]:border-orange has-[:checked]:bg-orange-50/50">
          <input type="radio" value="email" className="mt-1 accent-orange" {...register("verification_channel")} />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Mail className="h-4 w-4" /> Par e-mail</span>
            <span className="text-xs text-muted-foreground">Recevoir un lien d’activation dans votre boîte mail.</span>
          </span>
        </label>
      </fieldset>

      {isMerchant && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange" />
          <p className="text-xs text-muted-foreground">
            Vous pourrez envoyer votre pièce d'identité juste après, à votre première connexion, pour activer
            votre boutique.
          </p>
        </div>
      )}

      {serverError && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
          <TriangleAlert className="h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}

      <Button type="submit" loading={isSubmitting} className="mt-2 w-full">
        {isMerchant ? "Créer mon compte vendeur" : "Créer mon compte"}
      </Button>
    </form>
  );
}
