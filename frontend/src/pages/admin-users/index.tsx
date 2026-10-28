import { useMemo, useState } from "react";
import { Users, X } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as usersApi from "@/api/users";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";

const PAGE_SIZE = 20;

const ROLE_BADGE_VARIANT: Record<string, "default" | "success" | "warning" | "danger"> = {
  admin: "danger",
  merchant: "warning",
  driver: "success",
  client: "default",
};

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const {
    data: result,
    loading: loadingUsers,
    error,
    refetch: refetchUsers,
  } = useAsync(() => usersApi.listUsersPaginated({ page }), [page]);
  const { data: roles, loading: loadingRoles } = useAsync(() => usersApi.listRoles(), []);
  const {
    data: userRoles,
    loading: loadingUserRoles,
    refetch: refetchUserRoles,
  } = useAsync(() => usersApi.listAllUserRoles(), []);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const users = result?.results ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.count / PAGE_SIZE)) : 1;

  const userRolesByUser = useMemo(() => {
    const map = new Map<string, usersApi.UserRoleAssignment[]>();
    for (const ur of userRoles ?? []) {
      const list = map.get(ur.user) ?? [];
      list.push(ur);
      map.set(ur.user, list);
    }
    return map;
  }, [userRoles]);

  async function handleAssign(userId: string, roleId: number) {
    if (!roleId) return;
    setBusyKey(`${userId}-assign`);
    try {
      await usersApi.assignRole(userId, roleId);
      await refetchUserRoles();
      refetchUsers();
    } finally {
      setBusyKey(null);
    }
  }

  async function handleRemove(userRoleId: number, userId: string) {
    setBusyKey(`${userId}-${userRoleId}`);
    try {
      await usersApi.removeUserRole(userRoleId);
      await refetchUserRoles();
      refetchUsers();
    } finally {
      setBusyKey(null);
    }
  }

  const loading = loadingUsers || loadingRoles || loadingUserRoles;

  if (loading) return <Spinner label="Chargement des utilisateurs…" />;

  return (
    <div>
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-bold text-gray-900">
        <Users className="h-6 w-6 text-orange" /> Utilisateurs
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Attribuez ou retirez des rôles (client, commerçant, livreur, admin) à n'importe quel compte.
      </p>

      {error ? (
        <ErrorState fullPage onRetry={refetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="Aucun utilisateur" />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {users.map((user) => {
              const assigned = userRolesByUser.get(user.id) ?? [];
              const assignedNames = new Set(assigned.map((a) => a.role_name));
              const availableRoles = roles?.filter((r) => !assignedNames.has(r.name)) ?? [];
              return (
                <Card key={user.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {assigned.map((ur) => (
                      <Badge
                        key={ur.id}
                        variant={ROLE_BADGE_VARIANT[ur.role_name] ?? "default"}
                        className="flex items-center gap-1 pr-1"
                      >
                        {ur.role_name}
                        <button
                          onClick={() => handleRemove(ur.id, user.id)}
                          disabled={busyKey === `${user.id}-${ur.id}`}
                          aria-label={`Retirer le rôle ${ur.role_name}`}
                          className="focus-ring rounded-full p-0.5 transition-colors hover:bg-black/10 disabled:opacity-40"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                    {availableRoles.length > 0 && (
                      <select
                        aria-label="Attribuer un rôle"
                        value=""
                        disabled={busyKey === `${user.id}-assign`}
                        onChange={(e) => handleAssign(user.id, Number(e.target.value))}
                        className="focus-ring rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-orange/50"
                      >
                        <option value="" disabled>
                          + Ajouter un rôle…
                        </option>
                        {availableRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-6" />
        </>
      )}
    </div>
  );
}
