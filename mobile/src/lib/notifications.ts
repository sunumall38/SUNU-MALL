import { apiGet, apiPost } from "@/lib/api";
import type { AppNotification, Paginated } from "@/types";

export async function listNotifications() {
  const data = await apiGet<Paginated<AppNotification>>("/monetization/notifications/");
  return data.results;
}

export function markAllNotificationsRead() {
  return apiPost<void>("/monetization/notifications/read-all/");
}
