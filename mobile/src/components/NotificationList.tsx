import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { apiErrorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { listNotifications, markAllNotificationsRead } from "@/lib/notifications";
import { colors } from "@/theme";
import type { AppNotification } from "@/types";

/** Notifications du compte connecté (client ou commerçant), marquées lues à l'ouverture. */
export function NotificationList() {
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
