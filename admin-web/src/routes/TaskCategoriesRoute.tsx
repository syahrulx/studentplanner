import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { IconClipboard, IconPencil } from '../ui/icons';

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

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
        active
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

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

  return (
    <div>
      <MotionSection>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              Task Categories
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Manage the task type options shown to all users in the app.
            </div>
          </div>
          <button
            id="btn-add-task-category"
            onClick={openCreate}
            className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-elev1 transition hover:bg-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            <span className="text-lg leading-none">+</span> Add Category
          </button>
        </div>
      </MotionSection>

      <MotionSection delay={0.06} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
            {error && (
              <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </div>
            )}
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm font-semibold text-slate-400">
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20">
                <IconClipboard className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-400">
                  {searchQuery.trim() ? 'No categories match your search.' : 'No categories yet. Add one!'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-3 text-left text-xs font-black tracking-wider text-slate-400 uppercase">Icon</th>
                    <th className="px-5 py-3 text-left text-xs font-black tracking-wider text-slate-400 uppercase">Name</th>
                    <th className="px-5 py-3 text-left text-xs font-black tracking-wider text-slate-400 uppercase">Color</th>
                    <th className="px-5 py-3 text-left text-xs font-black tracking-wider text-slate-400 uppercase">Order</th>
                    <th className="px-5 py-3 text-left text-xs font-black tracking-wider text-slate-400 uppercase">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-black tracking-wider text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(cat => (
                    <tr key={cat.id} className="group transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3.5 text-xl">{cat.icon ?? '—'}</td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-slate-100">{cat.name}</td>
                      <td className="px-5 py-3.5">
                        {cat.color ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-5 w-5 rounded-full border border-slate-200 dark:border-slate-700"
                              style={{ backgroundColor: cat.color }}
                            />
                            <span className="font-mono text-xs text-slate-500">{cat.color}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-500 dark:text-slate-400">{cat.sort_order}</td>
                      <td className="px-5 py-3.5"><Badge active={cat.is_active} /></td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title={cat.is_active ? 'Deactivate' : 'Activate'}
                            onClick={() => handleToggleActive(cat)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                              cat.is_active
                                ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-700 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}
                          >
                            {cat.is_active ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            title="Edit"
                            onClick={() => openEdit(cat)}
                            className="rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                          >
                            <IconPencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Delete"
                            onClick={() => { setDeleteId(cat.id); setConfirmDelete(true); }}
                            className="rounded-xl bg-red-50 p-2 text-red-500 transition hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-900/50"
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
          </div>
        </MotionPanel>
      </MotionSection>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
              {editId ? 'Edit Category' : 'Add Category'}
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">
                  Name *
                </label>
                <input
                  id="category-name"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Essay"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">
                    Icon (emoji)
                  </label>
                  <input
                    id="category-icon"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={form.icon ?? ''}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="📝"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">
                    Color
                  </label>
                  <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <input
                      type="color"
                      className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent"
                      value={form.color ?? '#3b82f6'}
                      onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                    />
                    <span className="font-mono text-xs text-slate-500">{form.color}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    value={form.sort_order}
                    onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  />
                </div>
                <div className="flex flex-col justify-end pb-1">
                  <label className="mb-1 block text-xs font-black uppercase tracking-wider text-slate-400">
                    Status
                  </label>
                  <button
                    onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                      form.is_active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400'
                        : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {form.is_active ? '✓ Active' : '✗ Inactive'}
                  </button>
                </div>
              </div>
            </div>
            {error && (
              <p className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                id="btn-save-category"
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
              >
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Category'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">Delete Category?</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
              This is permanent. Existing tasks using this category will keep their current value, but it will no longer appear as a choice in the app.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setDeleteId(null); setConfirmDelete(false); }}
                className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
