import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from "react-native";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { changePlan, listPlans, renewSubscription, subscribe, type SubscriptionPlan } from "@/lib/merchant";
import { formatDate } from "@/lib/orderStatus";
import { getPaymentMethods } from "@/lib/payments";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius, shadow } from "@/theme";

type PayMethod = "wave" | "orange_money";

const METHODS: { id: PayMethod; label: string; logo: ImageSourcePropType }[] = [
  { id: "wave", label: "Wave", logo: require("../../../assets/payments/wave.png") },
  { id: "orange_money", label: "Orange Money", logo: require("../../../assets/payments/orange-money.png") },
];

/** Abonnement vendeur : formule actuelle, offres, paiement Wave / Orange Money dans l'appli. */
export default function SubscriptionScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const account = useMerchantStore((s) => s.account);
  const reloadMerchant = useMerchantStore((s) => s.load);
  const [plans, setPlans] = useState<SubscriptionPlan[] | null>(null);
  const [methods, setMethods] = useState<typeof METHODS>([]);
  const [method, setMethod] = useState<PayMethod>("wave");
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextPlans, available] = await Promise.all([listPlans(), getPaymentMethods()]);
      setPlans(nextPlans);
      const open = METHODS.filter((m) => available.methods.some((a) => a.id === m.id));
      setMethods(open);
      // Le moyen choisi n'est peut-être pas ouvert : on prend le premier proposé.
      setMethod((current) => (open.some((m) => m.id === current) ? current : (open[0]?.id ?? current)));
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les offres."));
    }
  }, []);

  useEffect(() => {
    void load();
    if (userId) void reloadMerchant(userId);
  }, [load, reloadMerchant, userId]);

  const current = account?.subscription ?? null;
  const active = Boolean(account?.has_active_subscription && current);
  // Sans formule : l'essai gratuit, s'il n'est pas terminé.
  const trial = !active && account?.trial?.status !== "ended" ? account?.trial : undefined;

  async function choose(plan: SubscriptionPlan) {
    setBusyPlan(plan.id);
    setError(null);
    try {
      const result = !active
        ? await subscribe(plan.id, method)
        : current?.plan_name === plan.name
          ? await renewSubscription(method)
          : await changePlan(plan.code, method);
      if (!result.payment) {
        setError("Abonnement enregistré, mais le paiement n'a pas pu être préparé. Contactez le support.");
        return;
      }
      router.push({ pathname: "/merchant/payment/[id]", params: { id: result.payment.id, start: "1" } });
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de lancer l'abonnement."));
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[styles.current, active ? styles.currentActive : trial ? styles.currentTrial : styles.currentNone]}>
        <Ionicons
          name={active ? "ribbon" : trial ? "gift-outline" : "alert-circle-outline"}
          size={26}
          color={active ? colors.success : trial ? colors.orange : colors.danger}
        />
        <View style={styles.flex}>
          {trial ? (
            <>
              <Text style={styles.currentTitle}>
                {trial.status === "pending"
                  ? `Essai gratuit de ${trial.days_left} jours`
                  : `Essai gratuit : ${trial.days_left} jour${trial.days_left > 1 ? "s" : ""} restant${trial.days_left > 1 ? "s" : ""}`}
              </Text>
              <Text style={styles.muted}>
                {trial.status === "pending" || !trial.ends_at
                  ? "Il commencera le jour où Sunu Mall validera votre boutique."
                  : `Jusqu'au ${formatDate(trial.ends_at)}. Choisissez ensuite une formule pour continuer à vendre.`}
              </Text>
            </>
          ) : active && current ? (
            <>
              <Text style={styles.currentTitle}>Formule {current.plan_name}</Text>
              <Text style={styles.muted}>
                {current.in_grace
                  ? "Expirée : période de grâce, renouvelez pour continuer à vendre."
                  : current.ends_at
                    ? `Active jusqu'au ${formatDate(current.ends_at)}${current.days_left != null ? ` (${current.days_left} j)` : ""}`
                    : "Active"}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.currentTitle}>Aucun abonnement actif</Text>
              <Text style={styles.muted}>Choisissez une formule pour créer des produits et recevoir des commandes.</Text>
            </>
          )}
        </View>
      </View>

      {methods.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Payer avec</Text>
          <View style={styles.methods}>
            {methods.map((m) => {
              const selected = m.id === method;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setMethod(m.id)}
                  style={[styles.method, selected && styles.methodSelected]}
                >
                  <Image source={m.logo} style={styles.logo} />
                  <Text style={styles.methodLabel}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Nos formules</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!plans ? (
        error ? (
          <Button label="Réessayer" variant="secondary" onPress={load} />
        ) : (
          <ActivityIndicator color={colors.orange} style={styles.loader} />
        )
      ) : (
        plans.map((plan) => {
          const isCurrent = active && current?.plan_name === plan.name;
          return (
            <View key={plan.id} style={[styles.plan, isCurrent && styles.planCurrent]}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                {isCurrent ? <Text style={styles.currentBadge}>Votre formule</Text> : null}
              </View>
              <Text style={styles.price}>
                {formatPrice(plan.price)}
                <Text style={styles.per}> / {plan.duration_days} jours</Text>
              </Text>
              <Feature text={plan.max_products == null ? "Produits illimités" : `Jusqu'à ${plan.max_products} produits`} />
              <Feature text={`Commission ${Number(plan.commission_rate)} % sur les ventes`} />
              <Button
                label={!active ? "Choisir cette formule" : isCurrent ? "Renouveler" : "Passer à cette formule"}
                variant={isCurrent || !active ? "primary" : "secondary"}
                onPress={() => choose(plan)}
                loading={busyPlan === plan.id}
                disabled={busyPlan !== null || methods.length === 0}
              />
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <View style={styles.feature}>
      <Ionicons name="checkmark-circle" size={16} color={colors.success} />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  flex: { flex: 1 },
  muted: { fontSize: 13, lineHeight: 18, color: colors.mutedForeground },
  loader: { marginVertical: 24 },
  current: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radius.md, padding: 14 },
  currentActive: { backgroundColor: colors.successBg },
  currentNone: { backgroundColor: "#FEF2F2" },
  currentTrial: { backgroundColor: colors.accent },
  currentTitle: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: colors.ink, marginTop: 6 },
  methods: { flexDirection: "row", gap: 10 },
  method: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  methodSelected: { borderColor: colors.orange, backgroundColor: colors.accent },
  logo: { width: 30, height: 30, borderRadius: 8 },
  methodLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
  error: { fontSize: 14, color: colors.danger },
  plan: { backgroundColor: colors.white, borderRadius: radius.md, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.white, ...shadow },
  planCurrent: { borderColor: colors.orange },
  planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planName: { fontSize: 18, fontWeight: "800", color: colors.navy },
  currentBadge: { fontSize: 12, fontWeight: "700", color: colors.orangeDark },
  price: { fontSize: 22, fontWeight: "800", color: colors.ink },
  per: { fontSize: 13, fontWeight: "400", color: colors.mutedForeground },
  feature: { flexDirection: "row", alignItems: "center", gap: 6 },
  featureText: { fontSize: 14, color: colors.ink },
});
