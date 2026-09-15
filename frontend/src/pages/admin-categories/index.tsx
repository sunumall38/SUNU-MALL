import { useCallback, useState } from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import * as catalogApi from "@/api/catalog";
import { apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import type { Category } from "@/types";

export default function AdminCategoriesPage() {
  const fetcher = useCallback(() => catalogApi.listCategories(), []);
  const { data, loading, error, refetch } = useAsync(fetcher, []);
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const categories = data ?? [];
  const parents = categories.filter((c) => !c.parent);
  const childrenMap = new Map<string, Category[]>();
  categories.forEach((c) => {
    if (c.parent) childrenMap.set(c.parent, [...(childrenMap.get(c.parent) ?? []), c]);
  });

  function openCreate(parentId = "") {
    setEditing(null);
    setName("");
    setParent(parentId);
    setImage(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    setName(category.name);
    setParent(category.parent ?? "");
    setImage(null);
    setFormError(null);
    setFormOpen(true);
  }

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setFormError("Le nom de la catégorie est obligatoire.");
    setSaving(true);
    setFormError(null);
    try {
      const category = editing
        ? await catalogApi.updateCategory(editing.id, { name: name.trim(), parent: parent || null })
        : await catalogApi.createCategory({ name: name.trim(), parent: parent || null });
      if (image) await catalogApi.uploadCategoryImage(category.id, image);
      setFormOpen(false);
      refetch();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Impossible d’enregistrer la catégorie."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await catalogApi.deleteCategory(deleting.id);
      setDeleting(null);
      refetch();
    } catch (err) {
      setFormError(apiErrorMessage(err, "Impossible de supprimer la catégorie."));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <Spinner label="Chargement des catégories..." />;
  if (error) return <ErrorState message={error.message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/admin" }, { label: "Catégories" }]} />
      {formError && !formOpen && <ErrorState message={formError} />}
      <Card>
        <CardHeader>
          <CardTitle>Catégories</CardTitle>
          <Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4" />Nouvelle catégorie</Button>
        </CardHeader>
        {parents.length === 0 ? (
          <EmptyState icon={Tag} title="Aucune catégorie" description="Créez la première catégorie du catalogue." />
        ) : (
          <div className="space-y-4">
            {parents.map((cat) => {
              const children = childrenMap.get(cat.id) ?? [];
              return (
                <div key={cat.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-3">
                    {cat.image_url ? <img src={cat.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : (
                      <div className="grid h-10 w-10 place-items-center rounded bg-muted"><Tag className="h-5 w-5 text-muted-foreground" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{cat.name}</p>
                      <p className="text-xs text-muted-foreground">{children.length} sous-catégorie{children.length > 1 ? "s" : ""}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => openCreate(cat.id)}><Plus className="h-4 w-4" />Sous-catégorie</Button>
                    <Button variant="ghost" size="sm" aria-label={`Modifier ${cat.name}`} onClick={() => openEdit(cat)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" aria-label={`Supprimer ${cat.name}`} onClick={() => setDeleting(cat)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                  {children.length > 0 && (
                    <div className="mt-3 ml-13 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {children.map((child) => (
                        <div key={child.id} className="flex items-center rounded bg-muted/50 px-3 py-2 text-sm text-ink">
                          <span className="flex-1 truncate">{child.name}</span>
                          <button className="focus-ring rounded p-1" aria-label={`Modifier ${child.name}`} onClick={() => openEdit(child)}><Pencil className="h-3.5 w-3.5" /></button>
                          <button className="focus-ring rounded p-1" aria-label={`Supprimer ${child.name}`} onClick={() => setDeleting(child)}><Trash2 className="h-3.5 w-3.5 text-danger" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Modifier la catégorie" : "Nouvelle catégorie"}>
        <form className="space-y-4" onSubmit={saveCategory}>
          <Input label="Nom" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          <Select label="Catégorie parente" value={parent} onChange={(event) => setParent(event.target.value)}>
            <option value="">Aucune — catégorie principale</option>
            {parents.filter((item) => item.id !== editing?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Input label="Image (facultative)" type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] ?? null)} />
          {formError && <ErrorState message={formError} />}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>Annuler</Button>
            <Button type="submit" loading={saving}>Enregistrer</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Supprimer la catégorie ?"
        message={`La catégorie « ${deleting?.name ?? ""} » et ses sous-catégories seront supprimées. Les produits resteront disponibles sans catégorie.`}
        confirmLabel="Supprimer"
        loading={deleteBusy}
      />
    </div>
  );
}
