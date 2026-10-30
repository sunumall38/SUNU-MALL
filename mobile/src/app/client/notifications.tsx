import { LoginPrompt } from "@/components/EmptyState";
import { NotificationList } from "@/components/NotificationList";
import { useAuthStore } from "@/store/auth";

export default function NotificationsScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  if (!signedIn) {
    return <LoginPrompt icon="notifications-outline" title="Notifications" text="Connectez-vous pour suivre vos commandes." />;
  }
  return <NotificationList />;
}
