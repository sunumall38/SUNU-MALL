import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { initiatePayment, refreshPayment, sandboxConfirmPayment } from "@/lib/payments";
import { colors } from "@/theme";
import type { Payment, PaymentMethodId } from "@/types";

/** Vérifications après le retour de Wave / Orange Money : toutes les 3 s pendant 1 min. */
const POLL_INTERVAL_MS = 3000;
const MAX_CHECKS = 20;

const METHOD_LABELS: Record<PaymentMethodId, string> = {
  wave: "Wave",
  orange_money: "Orange Money",
  card: "Carte bancaire",
};

/**
 * Paiement (commande ou abonnement). Avec `start="1"`, le paiement est lancé
 * tout de suite : la page Wave / Orange Money s'ouvre, puis, au retour dans
 * l'appli, le statut est demandé au serveur, qui le vérifie lui-même auprès
 * du fournisseur. Le retour seul ne prouve rien. `renderSuccess` donne le
 * texte et les boutons une fois le paiement confirmé.
 */
export function PaymentFlow({
  id,
  start,
  renderSuccess,
}: {
  id: string;
  start?: string;
  renderSuccess: (payment: Payment) => ReactNode;
}) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [sandboxMessage, setSandboxMessage] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [simulating, setSimulating] = useState<"success" | "failed" | null>(null);
  // Chaque série de vérifications a son numéro : une nouvelle série (ou la
  // fermeture de l'écran) arrête la précédente.
  const pollRun = useRef(0);

  const check = useCallback(async () => {
    try {
      const result = await refreshPayment(id);
      setPayment(result);
      setError(null);
      return result;
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de vérifier le paiement."));
      return null;
    }
  }, [id]);

  const poll = useCallback(async () => {
    const run = ++pollRun.current;
    setPolling(true);
    for (let i = 0; i < MAX_CHECKS; i++) {
      const result = await check();
      if (run !== pollRun.current) return;
      if (!result || result.status !== "pending") break;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (run !== pollRun.current) return;
    }
    setPolling(false);
  }, [check]);

  const pay = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      const result = await initiatePayment(id);
      // Après un échec, le serveur remet le paiement « en attente ».
      await check();
      if (result.checkout_url) {
        setCheckoutUrl(result.checkout_url);
        await Linking.openURL(result.checkout_url).catch(() => {
          setError("Impossible d'ouvrir la page de paiement. Touchez « Rouvrir la page de paiement ».");
        });
      } else {
        setSandboxMessage(result.message || "Mode test : aucune vraie transaction n'est envoyée.");
      }
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de démarrer le paiement."));
    } finally {
      setStarting(false);
    }
  }, [id, check]);

  const launched = useRef(false);
  useEffect(() => {
    if (launched.current) return;
    launched.current = true;
    if (start === "1") void pay();
    else void poll();
  }, [start, pay, poll]);

  // Retour dans l'appli après la page du fournisseur : on vérifie le statut.
  useEffect(() => {
    if (!checkoutUrl) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void poll();
    });
    return () => subscription.remove();
  }, [checkoutUrl, poll]);

  useEffect(
    () => () => {
      pollRun.current++;
    },
    [],
  );

  async function simulate(outcome: "success" | "failed") {
    setSimulating(outcome);
    try {
      setPayment(await sandboxConfirmPayment(id, outcome));
    } catch (err) {
      setError(apiErrorMessage(err, "La simulation a échoué."));
    } finally {
      setSimulating(null);
    }
  }

  if (!payment) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={start === "1" ? pay : poll} />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.orange} />
            <Text style={styles.muted}>Préparation du paiement…</Text>
          </>
        )}
      </View>
    );
  }

  const orderId = payment.order ?? payment.global_order;
  const reference = orderId ? `Commande n°${orderId.slice(0, 8)} · ` : "";
  const amount = `${reference}${formatPrice(payment.amount)} via ${METHOD_LABELS[payment.method]}`;

  if (payment.status === "success") {
    return (
      <Panel icon="checkmark-circle" iconColor="#16A34A" title="Paiement confirmé" subtitle={amount}>
        {renderSuccess(payment)}
      </Panel>
    );
  }

  if (payment.status === "refunded") {
    return (
      <Panel icon="return-down-back" iconColor={colors.mutedForeground} title="Paiement remboursé" subtitle={amount}>
        <Button label="Retour" variant="secondary" onPress={() => router.back()} />
      </Panel>
    );
  }

  if (payment.status === "failed") {
    return (
      <Panel icon="close-circle" iconColor={colors.danger} title="Le paiement n'a pas abouti" subtitle={amount}>
        <Text style={styles.text}>Aucun montant n'a été débité. Vous pouvez réessayer.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Réessayer le paiement" onPress={pay} loading={starting} />
        <Button label="Plus tard" variant="ghost" onPress={() => router.back()} />
      </Panel>
    );
  }

  // En attente.
  if (sandboxMessage) {
    return (
      <Panel icon="flask-outline" iconColor="#D97706" title="Mode test" subtitle={amount}>
        <Text style={styles.text}>{sandboxMessage}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Simuler un paiement réussi" onPress={() => simulate("success")} loading={simulating === "success"} />
        <Button
          label="Simuler un échec"
          variant="secondary"
          onPress={() => simulate("failed")}
          loading={simulating === "failed"}
        />
      </Panel>
    );
  }

  if (checkoutUrl) {
    return (
      <Panel icon="phone-portrait-outline" iconColor={colors.orange} title={`Validez dans ${METHOD_LABELS[payment.method]}`} subtitle={amount}>
        <Text style={styles.text}>
          Revenez ensuite dans l'appli : la confirmation s'affiche automatiquement. Si vous avez déjà validé, inutile
          de payer une seconde fois.
        </Text>
        {polling ? (
          <View style={styles.pollingRow}>
            <ActivityIndicator color={colors.orange} />
            <Text style={styles.muted}>Vérification du paiement…</Text>
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="J'ai payé, vérifier" onPress={poll} disabled={polling} />
        <Button label="Rouvrir la page de paiement" variant="secondary" onPress={() => Linking.openURL(checkoutUrl)} />
      </Panel>
    );
  }

  return (
    <Panel icon="time-outline" iconColor="#D97706" title="Paiement en attente" subtitle={amount}>
      {polling ? (
        <View style={styles.pollingRow}>
          <ActivityIndicator color={colors.orange} />
          <Text style={styles.muted}>Vérification du paiement…</Text>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label="Payer maintenant" onPress={pay} loading={starting} />
    </Panel>
  );
}

/** Texte d'explication sous « Paiement confirmé ». */
export function PaymentSuccessText({ children }: { children: string }) {
  return <Text style={styles.text}>{children}</Text>;
}

function Panel({
  icon,
  iconColor,
  title,
  subtitle,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <ScrollView contentContainerStyle={styles.panel}>
      <Ionicons name={icon} size={64} color={iconColor} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.actions}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24, backgroundColor: colors.background },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  panel: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink, textAlign: "center" },
  subtitle: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: 12, marginTop: 12 },
  text: { fontSize: 15, lineHeight: 21, color: colors.ink, textAlign: "center" },
  error: { fontSize: 14, color: colors.danger, textAlign: "center" },
  pollingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
});
