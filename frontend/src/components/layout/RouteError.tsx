import { useEffect } from "react";
import { Link, useRouteError } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Écran affiché quand une page plante (au lieu de la page d'erreur brute de
 * React Router) : l'erreur part dans la console pour le diagnostic, la
 * personne peut recharger ou revenir à l'accueil.
 */
export function RouteError() {
  const error = useRouteError();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-red-100">
        <AlertTriangle className="h-7 w-7 text-danger" />
      </div>
      <h1 className="font-display text-xl font-bold text-ink">Cette page a rencontré un problème</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Rechargez la page. Si l'erreur persiste, revenez à l'accueil et contactez le support.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => window.location.reload()}>Recharger la page</Button>
        <Link to="/home">
          <Button variant="secondary">Retour à l'accueil</Button>
        </Link>
      </div>
    </div>
  );
}
