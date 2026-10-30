import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AddressForm } from "@/components/AddressForm";
import { Button } from "@/components/Button";
import { LoginPrompt } from "@/components/EmptyState";
import { apiErrorMessage } from "@/lib/api";
import { listAddresses } from "@/lib/orders";
import { useAuthStore } from "@/store/auth";
import { useCheckoutStore } from "@/store/checkout";
import { colors, radius, shadow } from "@/theme";
import type { Address } from "@/types";

/**
 * Carnet d'adresses. Avec `select=1` (depuis « Livraison et paiement »),
 * toucher ou créer une adresse la choisit pour la commande et revient.
 */
export default function AddressesScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  if (!signedIn) {
    return <LoginPrompt icon="location-outline" title="Mes adresses" text="Connectez-vous pour gérer vos adresses de livraison." />;
  }
  return <AddressBook />;
}

function AddressBook() {
  const { select, add } = useLocalSearchParams<{ select?: string; add?: string }>();
  const selecting = select === "1";
  const setCheckoutAddress = useCheckoutStore((s) => s.setAddress);
  const selectedId = useCheckoutStore((s) => s.address?.id);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(add === "1");

  const load = useCallback(async () => {
    setError(null);
    try {
      setAddresses(await listAddresses());
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger vos adresses."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function choose(address: Address) {
    if (!selecting) return;
    setCheckoutAddress(address);
    router.back();
  }

  if (!addresses) {
    return (
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.muted}>{error}</Text>
            <Button label="Réessayer" variant="secondary" onPress={load} />
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.orange} />
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      {showForm || addresses.length === 0 ? (
        <AddressForm
          onCancel={addresses.length > 0 ? () => setShowForm(false) : undefined}
          onCreated={(address) => {
            setAddresses([address, ...addresses]);
            setShowForm(false);
            if (selecting) choose(address);
          }}
        />
      ) : (
        <>
          {selecting ? <Text style={styles.intro}>Choisissez l'adresse de livraison.</Text> : null}
          {addresses.map((address) => {
            const selected = selecting && address.id === selectedId;
            return (
              <Pressable
                key={address.id}
                accessibilityRole={selecting ? "radio" : undefined}
                accessibilityState={selecting ? { selected } : undefined}
                disabled={!selecting}
                onPress={() => choose(address)}
                style={[styles.card, selected && styles.cardSelected]}
              >
                <Ionicons name="location-outline" size={22} color={colors.orange} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{address.label}</Text>
                  <Text style={styles.cardText}>
                    {address.street}, {address.city}
                  </Text>
                  {address.latitude ? <Text style={styles.gps}>Position GPS enregistrée</Text> : null}
                </View>
                {selecting ? (
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={22}
                    color={selected ? colors.orange : colors.mutedForeground}
                  />
                ) : null}
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" onPress={() => setShowForm(true)} style={styles.addLink} hitSlop={8}>
            <Ionicons name="add-circle-outline" size={20} color={colors.orange} />
            <Text style={styles.addLinkText}>Ajouter une adresse</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  content: { padding: 16, gap: 12 },
  intro: { fontSize: 15, color: colors.mutedForeground },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.white,
    padding: 14,
    ...shadow,
  },
  cardSelected: { borderColor: colors.orange },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  cardText: { fontSize: 14, color: colors.mutedForeground },
  gps: { fontSize: 12, color: colors.success },
  addLink: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  addLinkText: { fontSize: 15, fontWeight: "700", color: colors.orange },
});
