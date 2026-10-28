import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, MailCheck, Phone, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { apiErrorMessage } from "@/lib/api";
import * as authApi from "@/api/auth";

/**
 * « Mot de passe oublié » : le client saisit son numéro (ou son email) et
 * reçoit un lien de réinitialisation à l'adresse email de son compte.
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = identifier.trim();
    if (!value) {
      setError("Indiquez votre numéro de téléphone ou votre email.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = value.includes("@") ? { email: value } : { phone: value };
      const res = await authApi.requestPasswordReset(payload);
      setSentMessage(res.message);
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible d'envoyer le lien pour le moment."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-orange">
          <KeyRound className="h-6 w-6" />
        </span>
        <h1 className="font-display text-2xl font-bold text-gray-900">Mot de passe oublié</h1>
        <p className="text-sm text-muted-foreground">
          Nous envoyons un lien de réinitialisation à l'adresse email de votre compte.
        </p>
      </div>

      {sentMessage ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <MailCheck className="h-10 w-10 text-success" />
          <p className="text-sm text-ink">{sentMessage}</p>
          <Link to="/login">
            <Button variant="secondary">Retour à la connexion</Button>
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Numéro de téléphone ou email"
            autoComplete="username"
            icon={Phone}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-red-50 px-3.5 py-2.5 text-sm text-danger">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" loading={submitting} className="w-full">
            Recevoir le lien
          </Button>
          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-orange">
            Retour à la connexion
          </Link>
        </form>
      )}
    </div>
  );
}
