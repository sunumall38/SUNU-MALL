import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { apiErrorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { checkout, listAddresses, quoteDelivery } from "@/lib/orders";
import { getPaymentMethods } from "@/lib/payments";
import { useCartStore } from "@/store/cart";
import { checkoutSubtotal, useCheckoutStore } from "@/store/checkout";
import { colors, radius, shadow } from "@/theme";
import type { CheckoutPayload, DeliveryType, PaymentMethodId } from "@/types";

const DELIVERY_OPTIONS: { id: DeliveryType; label: string; eta: string }[] = [
  { id: "standard", label: "Livraison standard", eta: "24-48h" },
  { id: "express", label: "Livraison express", eta: "2-4h" },
  { id: "pickup", label: "Retrait en boutique", eta: "Selon disponibilité" },
];

/** Moyens proposés dans l'appli : la carte bancaire reste sur le site pour l'instant. */
const APP_METHODS: { id: PaymentMethodId; label: string; logo: ImageSourcePropType }[] = [
  { id: "wave", label: "Wave", logo: require("../../../assets/payments/wave.png") },
  { id: "orange_money", label: "Orange Money", logo: require("../../../assets/payments/orange-money.png") },
];

/** « Livraison et paiement » : adresse, mode de livraison, moyen de paiement, récapitulatif. */
export default function CheckoutScreen() {
  const { storeId, items, address, deliveryType, paymentMethod, setAddress, setDelivery, setPaymentMethod } =
    useCheckoutStore();
  const fetchCart = useCartStore((s) => s.fetch);
  const [addressesLoaded, setAddressesLoaded] = useState(address !== null);
  const [fees, setFees] = useState<Record<DeliveryType, number> | null>(null);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [methods, setMethods] = useState<typeof APP_METHODS | null>(null);
  const [sandbox, setSandbox] = useState(false);
  const [methodsError, setMethodsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Première visite : l'adresse la plus récente est proposée.
  useEffect(() => {
    if (address) return;
    listAddresses()
      .then((list) => {
        if (list[0] && !useCheckoutStore.getState().address) setAddress(list[0]);
      })
      .catch(() => undefined)
      .finally(() => setAddressesLoaded(true));
  }, [address, setAddress]);

  // Frais des trois modes, calculés par le serveur pour l'adresse choisie.
  const loadFees = useCallback(async () => {
    if (!address) return;
    setFees(null);
    setFeesError(null);
    const quoteItems = items.map((i) => ({ product_variant: i.product_variant, quantity: i.quantity }));
    try {
      const entries = await Promise.all(
        DELIVERY_OPTIONS.map(async (o) => [o.id, await quoteDelivery(storeId, quoteItems, address.id, o.id)] as const),
      );
      setFees(Object.fromEntries(entries) as Record<DeliveryType, number>);
    } catch (err) {
      setFeesError(apiErrorMessage(err, "Impossible de calculer les frais de livraison."));
    }
  }, [address, items, storeId]);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  useEffect(() => {
    if (fees) setDelivery(deliveryType, fees[deliveryType]);
  }, [fees, deliveryType, setDelivery]);

  useEffect(() => {
    let cancelled = false;
    getPaymentMethods()
      .then((res) => {
        if (cancelled) return;
        const open = APP_METHODS.filter((m) => res.methods.some((s) => s.id === m.id));
        setMethods(open);
        setSandbox(res.sandbox);
        // Le moyen mémorisé n'est peut-être pas ouvert : on prend le premier proposé.
        if (open.length > 0 && !open.some((m) => m.id === useCheckoutStore.getState().paymentMethod)) {
          setPaymentMethod(open[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setMethodsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setPaymentMethod]);

  if (items.length === 0) return <Redirect href="/client/cart" />;

  const subtotal = checkoutSubtotal(items);
  const fee = fees?.[deliveryType] ?? null;
  const total = subtotal + (fee ?? 0);
  const articleCount = items.reduce((n, i) => n + i.quantity, 0);
  const methodOpen = methods?.some((m) => m.id === paymentMethod) ?? false;
  const canConfirm = address !== null && fee !== null && methodOpen;

  async function confirm() {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: CheckoutPayload = {
        address: address.id,
        delivery_type: deliveryType,
        payment_method: paymentMethod,
        items: items.map((i) => ({ product_variant: i.product_variant, quantity: i.quantity })),
      };
      if (storeId) payload.store = storeId;
      const order = await checkout(payload);
      // Les articles commandés ont quitté le panier côté serveur.
      void fetchCart();
      if (!order.payment) {
        setError("Commande enregistrée, mais le paiement n'a pas pu être préparé. Contactez le support.");
        return;
      }
      // Remplace cet écran : le retour arrière ne repasse pas la commande.
      router.replace({ pathname: "/client/payment/[id]", params: { id: order.payment.id, start: "1" } });
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de finaliser la commande."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>1. Adresse de livraison</Text>
        <View style={styles.card}>
          {!addressesLoaded ? (
            <ActivityIndicator color={colors.orange} style={styles.cardLoader} />
          ) : address ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Changer d'adresse"
              onPress={() => router.push({ pathname: "/client/addresses", params: { select: "1" } })}
              style={styles.cardRow}
            >
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {address.city}, {address.street}
                </Text>
                <Text style={styles.rowText}>{address.label}</Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
          {address ? <View style={styles.divider} /> : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/client/addresses", params: { select: "1", add: "1" } })}
            style={styles.cardRow}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.navy} />
            <Text style={styles.addText}>Ajouter une adresse</Text>
          </Pressable>
        </View>

        {address ? (
          <>
            <Text style={styles.sectionTitle}>2. Mode de livraison</Text>
            <View style={styles.card}>
              {feesError ? (
                <View style={styles.cardRow}>
                  <Text style={[styles.flex, styles.errorText]}>{feesError}</Text>
                  <Pressable onPress={loadFees} hitSlop={8}>
                    <Text style={styles.link}>Réessayer</Text>
                  </Pressable>
                </View>
              ) : !fees ? (
                <ActivityIndicator color={colors.orange} style={styles.cardLoader} />
              ) : (
                DELIVERY_OPTIONS.map((option, index) => (
                  <Fragment key={option.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <Choice
                      selected={option.id === deliveryType}
                      onPress={() => setDelivery(option.id, fees[option.id])}
                      title={option.label}
                      subtitle={option.eta}
                      trailing={fees[option.id] === 0 ? "Gratuit" : formatPrice(fees[option.id])}
                    />
                  </Fragment>
                ))
              )}
            </View>
          </>
        ) : null}

        <Text style={styles.sectionTitle}>{address ? "3." : "2."} Moyen de paiement</Text>
        <View style={styles.card}>
          {!methods && !methodsError ? <ActivityIndicator color={colors.orange} style={styles.cardLoader} /> : null}
          {methodsError || methods?.length === 0 ? (
            <Text style={[styles.cardRow, styles.warning]}>
              {methodsError
                ? "Impossible de charger les moyens de paiement. Vérifiez votre connexion."
                : "Le paiement en ligne n'est pas encore ouvert. Réessayez plus tard."}
            </Text>
          ) : null}
          {methods?.map((method, index) => (
            <Fragment key={method.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Choice
                selected={method.id === paymentMethod}
                onPress={() => setPaymentMethod(method.id)}
                title={method.label}
                logo={method.logo}
              />
            </Fragment>
          ))}
        </View>
        {sandbox ? <Text style={styles.sandbox}>Mode test : aucune vraie transaction ne sera envoyée.</Text> : null}

        <Text style={styles.sectionTitle}>{address ? "4." : "3."} Récapitulatif</Text>
        <View style={styles.summary}>
          <Row label={`Articles (${articleCount})`} value={formatPrice(subtotal)} />
          <Row
            label="Livraison"
            value={fee === null ? "—" : fee === 0 ? "Gratuit" : formatPrice(fee)}
          />
          <View style={styles.divider} />
          <Row label="Total" value={formatPrice(total)} strong />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Button label="Confirmer et payer" onPress={confirm} loading={submitting} disabled={!canConfirm} />
      </View>
    </SafeAreaView>
  );
}

function Choice({
  selected,
  onPress,
  title,
  subtitle,
  trailing,
  logo,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle?: string;
  trailing?: string;
  logo?: ImageSourcePropType;
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={styles.cardRow}>
      {logo ? <Image source={logo} style={styles.logo} /> : null}
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowText}>{subtitle}</Text> : null}
      </View>
      {trailing ? <Text style={styles.trailing}>{trailing}</Text> : null}
      <Ionicons
        name={selected ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={selected ? colors.orange : colors.mutedForeground}
      />
    </Pressable>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={strong ? styles.rowStrong : styles.rowLabel}>{label}</Text>
      <Text style={strong ? styles.rowStrong : styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.ink, marginTop: 6 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, ...shadow },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  cardLoader: { paddingVertical: 16 },
  divider: { height: 1, backgroundColor: colors.border },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  rowText: { fontSize: 13, color: colors.mutedForeground },
  addText: { fontSize: 14, fontWeight: "600", color: colors.navy },
  trailing: { fontSize: 14, fontWeight: "700", color: colors.ink },
  logo: { width: 36, height: 36, borderRadius: 9 },
  link: { fontSize: 14, fontWeight: "700", color: colors.orange },
  warning: { fontSize: 14, color: colors.warning },
  sandbox: { fontSize: 12, color: colors.warning },
  summary: { backgroundColor: colors.white, borderRadius: radius.md, padding: 14, gap: 10, ...shadow },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  rowLabel: { fontSize: 14, color: colors.mutedForeground },
  rowValue: { fontSize: 14, color: colors.ink },
  rowStrong: { fontSize: 17, fontWeight: "800", color: colors.ink },
  bottomBar: { padding: 16, gap: 10, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  errorText: { fontSize: 14, color: colors.danger },
});
