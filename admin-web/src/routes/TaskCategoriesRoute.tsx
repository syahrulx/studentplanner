import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { IconPencil } from '../ui/icons';
import { Button } from '../ui/Button';
import { Label, TextInput } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, SidePanel, SkeletonRows } from '../ui/page';
import { ConfirmDialog } from '../components/config/ConfirmDialog';

interface TaskCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

const EMPTY: Omit<TaskCategory, 'id' | 'created_at'> = {
  name: '',
  icon: '',
  color: '#3b82f6',
  is_active: true,
  sort_order: 0,
};

export function TaskCategoriesRoute() {
  const { searchQuery } = useAdminSearch();
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('task_categories')
      .select('*')
      .order('sort_order')
      .order('name');
    if (err) {
      console.error('[admin] task_categories list failed:', err);
      setError(`Could not load categories: ${err.message}`);
    } else {
      setCategories(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function openCreate() {
    setEditId(null);
    setForm({ ...EMPTY, sort_order: categories.length + 1 });
    setModalOpen(true);
  }

  function openEdit(cat: TaskCategory) {
    setEditId(cat.id);
    setForm({
      name: cat.name,
      icon: cat.icon ?? '',
      color: cat.color ?? '#3b82f6',
      is_active: cat.is_active,
      sort_order: cat.sort_order,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      icon: form.icon?.trim() || null,
      color: form.color?.trim() || null,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };

    // Use .select().single() so we (a) get the inserted/updated row back and
    // can splice it into local state without a full refetch, and (b) get a
    // hard error if RLS silently drops the row (e.g. bypass-mode admin
    // without a Supabase session — `auth.role()` is 'anon' and the
    // `task_categories_admin_write` policy denies the insert).
    const query = editId
      ? supabase.from('task_categories').update(payload).eq('id', editId).select().single()
      : supabase.from('task_categories').insert(payload).select().single();
    const { data, error: err } = await query;
    setSaving(false);

    if (err) {
      console.error('[admin] task_categories save failed:', err);
      const friendly =
        err.code === '23505'
          ? `A category named "${payload.name}" already exists. Pick a different name.`
          : err.message?.includes('row-level security')
            ? 'Permission denied — you must be signed in as an admin to add categories.'
            : err.message;
      setError(friendly);
      return;
    }

    // Optimistic local update so the new row appears immediately, then
    // refetch to keep sort_order canonical with the rest of the table.
    if (data) {
      if (editId) {
        setCategories((prev) => prev.map((c) => (c.id === editId ? (data as TaskCategory) : c)));
      } else {
        setCategories((prev) => [...prev, data as TaskCategory]);
      }
    }
    setModalOpen(false);
    fetchCategories();
  }

  async function handleToggleActive(cat: TaskCategory) {
    const { error: err } = await supabase
      .from('task_categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id);
    if (err) {
      console.error('[admin] task_categories toggle failed:', err);
      setError(`Could not change status: ${err.message}`);
      return;
    }
    fetchCategories();
  }

  async function handleDelete() {
    if (!deleteId) return;
    setSaving(true);
    const { error: err } = await supabase.from('task_categories').delete().eq('id', deleteId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDeleteId(null);
    setConfirmDelete(false);
    fetchCategories();
  }

  const filtered = categories.filter(c =>
    !searchQuery.trim() || matchesAdminSearch(searchQuery, `${c.name} ${c.icon ?? ''} task category`)
  );
  const activeCount = categories.filter((c) => c.is_active).length;
  const closeDelete = () => { setDeleteId(null); setConfirmDelete(false); };

  return (
    <div className="space-y-5">
      <MotionSection>
        <PageHeader
          title="Task categories"
          description="The task types students can pick in the app."
          actions={
            <Button id="btn-add-task-category" type="button" onClick={openCreate}>
              + Add category
            </Button>
          }
        />
      </MotionSection>

      {/* Errors from saving show inside the edit panel while it is open. */}
      {error && !modalOpen ? <Notice tone="danger">{error}</Notice> : null}

      <MotionSection delay={0.06}>
        <MotionPanel>
          <Panel
            title={loading ? 'Categories' : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
            description={loading ? undefined : `${activeCount} shown in the app, ${categories.length - activeCount} hidden. Sorted by order, then name.`}
            padded={false}
          >
            {loading ? (
              <div className="p-5"><SkeletonRows rows={4} height="h-12" /></div>
            ) : filtered.length === 0 ? (
              <div className="p-5">
                {searchQuery.trim() ? (
                  <EmptyState title="No categories match your search." />
                ) : (
                  <EmptyState
                    title="No categories yet"
                    action={<Button type="button" size="sm" onClick={openCreate}>+ Add category</Button>}
                  >
                    Add the first task type students can choose.
                  </EmptyState>
                )}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-black uppercase tracking-wide text-slate-400 dark:border-slate-800">
                    <th className="px-5 py-3">Category</th>
                    <th className="hidden px-3 py-3 sm:table-cell">Colour</th>
                    <th className="px-3 py-3 text-right">Order</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(cat => (
                    <tr key={cat.id} className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800"
                            aria-hidden="true"
                          >
                            {cat.icon || '—'}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">{cat.name}</span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        {cat.color ? (
                          <div className="flex items-center gap-2">
                            <span
                              className="h-4 w-4 rounded-full border border-slate-200 dark:border-slate-700"
                              style={{ backgroundColor: cat.color }}
                              aria-hidden="true"
                            />
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{cat.color}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-500 dark:text-slate-400">{cat.sort_order}</td>
                      <td className="px-3 py-3">
                        <Chip tone={cat.is_active ? 'success' : 'neutral'}>{cat.is_active ? 'Active' : 'Inactive'}</Chip>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            title={cat.is_active ? 'Deactivate' : 'Activate'}
                            onClick={() => handleToggleActive(cat)}
                            className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            {cat.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            title="Edit"
                            aria-label={`Edit ${cat.name}`}
                            onClick={() => openEdit(cat)}
                            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          >
                            <IconPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label={`Delete ${cat.name}`}
                            onClick={() => { setDeleteId(cat.id); setConfirmDelete(true); }}
                            className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                              <path d="M4.5 7.5h15M10 10.5v6m4-6v6M8.5 7.5V5.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2M19.5 7.5l-1 12a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8l-1-12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </MotionPanel>
      </MotionSection>

      {/* Add / edit */}
      {modalOpen && (
        <SidePanel
          title={editId ? 'Edit category' : 'Add category'}
          subtitle="Shown as a task type choice in the app."
          width="max-w-md"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                id="btn-save-category"
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
              >
                {saving ? 'Saving…' : editId ? 'Save changes' : 'Add category'}
              </Button>
            </>
          }
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div>
            <Label htmlFor="category-name" className="mb-1">Name *</Label>
            <TextInput
              id="category-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Essay"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category-icon" className="mb-1">Icon (emoji)</Label>
              <TextInput
                id="category-icon"
                value={form.icon ?? ''}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="📝"
              />
            </div>
            <div>
              <Label htmlFor="category-color" className="mb-1">Colour</Label>
              <div className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 dark:border-slate-800 dark:bg-slate-950/30">
                <input
                  id="category-color"
                  type="color"
                  className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent"
                  value={form.color ?? '#3b82f6'}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                />
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{form.color}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category-order" className="mb-1">Sort order</Label>
              <TextInput
                id="category-order"
                type="number"
                value={form.sort_order}
                onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
              />
            </div>
            <div>
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</span>
              <button
                type="button"
                aria-pressed={form.is_active}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-2xl border px-4 text-sm font-bold transition ${
                  form.is_active
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-400'
                }`}
              >
                {form.is_active ? 'Active' : 'Inactive'}
              </button>
            </div>
          </div>
        </SidePanel>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete category?"
          confirmLabel="Delete"
          busyLabel="Deleting…"
          busy={saving}
          onConfirm={handleDelete}
          onCancel={closeDelete}
        >
          This is permanent. Existing tasks using this category will keep their current value, but it will no longer appear as a choice in the app.
        </ConfirmDialog>
      )}
    </div>
  );
}
