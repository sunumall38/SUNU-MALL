import * as Linking from "expo-linking";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { SITE_URL } from "@/lib/config";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";

/** Espace livreur — provisoire : les courses et le GPS arrivent à l'étape livreurs. */
export default function DriverHome() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>Espace livreur</Text>
        <Text style={styles.text}>
          Bonjour {user?.first_name}. Vos courses arrivent bientôt dans l'appli. En attendant, continuez à les gérer
          depuis le site.
        </Text>
        <Button label="Ouvrir mes courses sur le site" onPress={() => Linking.openURL(`${SITE_URL}/driver-dashboard`)} />
        <Button label="Se déconnecter" variant="ghost" onPress={() => void logout()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, justifyContent: "center", padding: 24, gap: 16 },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  text: { fontSize: 15, lineHeight: 22, color: colors.mutedForeground },
});
