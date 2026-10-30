import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { StoreForm } from "@/components/StoreForm";
import { apiErrorMessage } from "@/lib/api";
import { mediaUrl } from "@/lib/format";
import { uploadStoreImage } from "@/lib/merchant";
import { pickPhotos } from "@/lib/photos";
import { useAuthStore } from "@/store/auth";
import { useMerchantStore } from "@/store/merchant";
import { colors, radius } from "@/theme";
import type { OwnStore } from "@/types";

/** « Ma boutique » : logo, bannière et informations ; une boutique refusée repart en examen. */
export default function MerchantStoreScreen() {
  const userId = useAuthStore((s) => s.user?.id);
  const store = useMerchantStore((s) => s.store) as OwnStore;
  const reload = useMerchantStore((s) => s.load);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const rejected = store.status === "suspended" && Boolean(store.rejection_reason);

  async function changeImage(kind: "logo" | "banner") {
    const [photo] = await pickPhotos(1);
    if (!photo) return;
    setUploading(kind);
    setMessage(null);
    try {
      await uploadStoreImage(store.id, kind, photo);
      if (userId) await reload(userId);
      setMessage({ text: kind === "logo" ? "Logo mis à jour." : "Bannière mise à jour.", error: false });
    } catch (err) {
      setMessage({ text: apiErrorMessage(err, "Envoi de l'image impossible."), error: true });
    } finally {
      setUploading(null);
    }
  }

  const banner = mediaUrl(store.banner_url);
  const logo = mediaUrl(store.logo_url);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {rejected ? (
          <Text style={styles.rejected}>
            Boutique refusée : {store.rejection_reason}. Corrigez puis enregistrez : elle repart en examen.
          </Text>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel="Changer la bannière" onPress={() => changeImage("banner")} style={styles.banner}>
          {banner ? <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
          <View style={styles.bannerAction}>
            {uploading === "banner" ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Ionicons name="image-outline" size={16} color={colors.white} />
                <Text style={styles.bannerText}>{banner ? "Changer la bannière" : "Ajouter une bannière"}</Text>
              </>
            )}
          </View>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Changer le logo" onPress={() => changeImage("logo")} style={styles.logo}>
          {logo ? (
            <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} />
          ) : (
            <Ionicons name="storefront" size={28} color={colors.orange} />
          )}
          <View style={styles.logoBadge}>
            {uploading === "logo" ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="camera" size={14} color={colors.white} />
            )}
          </View>
        </Pressable>

        {message ? <Text style={[styles.message, message.error ? styles.messageError : styles.messageOk]}>{message.text}</Text> : null}

        <StoreForm
          store={store}
          submitLabel={rejected ? "Corriger et renvoyer en examen" : "Enregistrer"}
          onSaved={async () => {
            if (userId) await reload(userId);
            router.back();
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  rejected: { fontSize: 14, lineHeight: 20, color: colors.danger, backgroundColor: "#FEF2F2", borderRadius: radius.sm, padding: 12 },
  banner: {
    height: 120,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.navy,
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 10,
  },
  bannerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(17,24,39,0.65)",
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  bannerText: { fontSize: 12, fontWeight: "700", color: colors.white },
  logo: {
    alignSelf: "center",
    width: 88,
    height: 88,
    borderRadius: 44,
    marginTop: -58,
    borderWidth: 4,
    borderColor: colors.background,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.orange,
  },
  message: { fontSize: 14, borderRadius: radius.sm, padding: 10, overflow: "hidden" },
  messageError: { color: colors.danger, backgroundColor: "#FEF2F2" },
  messageOk: { color: colors.success, backgroundColor: colors.successBg },
});
