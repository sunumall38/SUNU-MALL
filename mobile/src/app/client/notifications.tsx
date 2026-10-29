import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState, LoginPrompt } from "@/components/EmptyState";
import { apiErrorMessage } from "@/lib/api";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications";
import { useAuthStore } from "@/store/auth";
import { colors } from "@/theme";
import type { AppNotification } from "@/types";

export default function NotificationsScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  if (!signedIn) {
    return <LoginPrompt icon="notifications-outline" title="Notifications" text="Connectez-vous pour suivre vos commandes." />;
  }
  return <NotificationList />;
}

/** « Il y a 2 heures », « Il y a 3 jours ». */
function timeAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} heure${hours > 1 ? "s" : ""}`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} jour${days > 1 ? "s" : ""}`;
}

function NotificationList() {
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listNotifications());
    } catch (err) {
      setError(apiErrorMessage(err, "Impossible de charger les notifications."));
    }
  }, []);

  useEffect(() => {
    // Ouvrir la liste vaut lecture : les non-lues restent en gras cette fois-ci.
    void load().then(() => markAllNotificationsRead().catch(() => undefined));
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!items) {
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
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length ? styles.list : styles.listEmpty}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.orange} />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.icon}>
            <Ionicons name="bag-handle-outline" size={20} color={colors.orange} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.subject, !item.is_read && styles.unread]}>{item.subject}</Text>
            {item.message ? (
              <Text style={styles.message} numberOfLines={3}>
                {item.message}
              </Text>
            ) : null}
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <EmptyState icon="notifications-outline" title="Aucune notification" text="Le suivi de vos commandes s'affichera ici." />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  muted: { fontSize: 14, color: colors.mutedForeground, textAlign: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  listEmpty: { flexGrow: 1 },
  row: { flexDirection: "row", gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.peach,
    backgroundColor: colors.accent,
  },
  body: { flex: 1, gap: 3 },
  subject: { fontSize: 15, fontWeight: "600", color: colors.ink },
  unread: { fontWeight: "800" },
  message: { fontSize: 13, color: colors.mutedForeground },
  time: { fontSize: 12, color: colors.mutedForeground },
});
