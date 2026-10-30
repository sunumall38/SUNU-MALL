import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { PaymentFlow, PaymentSuccessText } from "@/components/PaymentFlow";

/** Paiement d'une commande ; `start=1` à l'arrivée depuis « Livraison et paiement ». */
export default function OrderPaymentScreen() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  return (
    <PaymentFlow
      id={id}
      start={start}
      renderSuccess={(payment) => {
        const orderId = payment.order ?? payment.global_order;
        return (
          <>
            <PaymentSuccessText>Votre commande est confirmée : le vendeur la prépare.</PaymentSuccessText>
            {orderId ? (
              <Button
                label="Voir ma commande"
                onPress={() =>
                  router.replace({
                    pathname: "/client/orders/[id]",
                    params: { id: orderId, kind: payment.global_order ? "global" : "order" },
                  })
                }
              />
            ) : null}
            <Button label="Continuer mes achats" variant="ghost" onPress={() => router.dismissTo("/client")} />
          </>
        );
      }}
    />
  );
}
