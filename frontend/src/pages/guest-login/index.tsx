import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/lib/api";
import * as authApi from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

/**
 * Arrivée depuis le lien envoyé par email à un client invité qui revient
 * commander : le jeton à usage unique est échangé contre une session, puis le
 * client retrouve son panier.
 */
export default function GuestLoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const loginSuccess = useAuthStore((s) => s.loginSuccess);
  const [error, setError] = useState<string | null>(null);
  // Le jeton ne sert qu'une fois : React StrictMode (dev) rejouerait l'effet
  // et le second appel échouerait, d'où ce verrou.
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setError("Lien de connexion incomplet.");
      return;
    }
    authApi
      .guestLogin(token)
      .then((data) => {
        loginSuccess(data);
        navigate("/cart", { replace: true });
      })
      .catch((err) => {
        setError(apiErrorMessage(err, "Ce lien est invalide ou a expiré."));
      });
  }, [searchParams, loginSuccess, navigate]);

  if (!error) return <Spinner label="Connexion en cours…" />;

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-red-100">
        <XCircle className="h-9 w-9 text-danger" />
      </span>
      <h1 className="font-display text-lg font-bold text-ink">Lien inutilisable</h1>
      <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
      <Link to="/cart" className="mt-2 w-full">
        <Button className="w-full">Retourner au panier</Button>
      </Link>
    </div>
  );
}
