import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, KeyRound, Lock, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ApiError, apiErrorMessage } from "@/lib/api";
import * as authApi from "@/api/auth";

/** Arrivée depuis le lien reçu par email : choix du nouveau mot de passe. */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await authApi.confirmPasswordReset({ token, new_password: password, confirm_password: confirm });
      setDone(true);
    } catch (err) {
      const data = err instanceof ApiError ? (err.data as Record<string, unknown> | null) : null;
      const fieldMessage = [data?.token, data?.new_password]
        .flat()
        .filter((v): v is string => typeof v === "string")
        .join(" ");
      setError(fieldMessage || apiErrorMessage(err, "Impossible de réinitialiser le mot de passe."));
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <TriangleAlert className="h-10 w-10 text-danger" />
        <p className="text-sm text-ink">Lien de réinitialisation incomplet.</p>
        <Link to="/mot-de-passe-oublie">
          <Button>Refaire une demande</Button>
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-sm text-ink">Mot de passe modifié. Vous pouvez maintenant vous connecter.</p>
        <Link to="/login">
          <Button>Se connecter</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-orange">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="font-display text-2xl font-bold text-gray-900">Nouveau mot de passe</h1>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nouveau mot de passe"
          type="password"
          autoComplete="new-password"
          icon={Lock}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirmer le mot de passe"
          type="password"
          autoComplete="new-password"
          icon={Lock}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>
              {error}{" "}
              {error.includes("expiré") && (
                <Link to="/mot-de-passe-oublie" className="font-semibold underline">
                  Nouvelle demande
                </Link>
              )}
            </span>
          </div>
        )}
        <Button type="submit" loading={submitting} className="w-full">
          Enregistrer
        </Button>
      </form>
    </div>
  );
}
