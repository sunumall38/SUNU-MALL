import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { PaymentFlow, PaymentSuccessText } from "@/components/PaymentFlow";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";

/** Paiement de l'abonnement vendeur ; `start=1` à l'arrivée depuis les offres. */
export default function SubscriptionPaymentScreen() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const reloadMerchant = useMerchantStore((s) => s.load);

  return (
    <PaymentFlow
      id={id}
      start={start}
      renderSuccess={() => (
        <>
          <PaymentSuccessText>Votre abonnement est actif : vous pouvez publier vos produits.</PaymentSuccessText>
          <Button
            label="Retour à mon espace"
            onPress={() => {
              if (userId) void reloadMerchant(userId);
              router.dismissTo("/merchant");
            }}
          />
        </>
      )}
    />
  );
}
