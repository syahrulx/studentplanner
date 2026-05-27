import { useEffect, useState } from 'react';
import { MotionPanel, MotionSection } from '../ui/motion';
import {
  listWhatsNewPrompts,
  upsertWhatsNewPrompt,
  deleteWhatsNewPrompt,
  type WhatsNewPromptRow,
} from '../lib/api';

function fmt(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function WhatsNewRoute() {
  const [items, setItems] = useState<WhatsNewPromptRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  
  // Editor state
  const [editing, setEditing] = useState<Partial<WhatsNewPromptRow> | null>(null);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const rows = await listWhatsNewPrompts();
      setItems(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load prompts');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.version_name || !editing?.title || !editing?.content) {
      setErr('Version, title, and content are required.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      await upsertWhatsNewPrompt({
        id: editing.id,
        is_active: editing.is_active ?? false,
        version_name: editing.version_name,
        title: editing.title,
        content: editing.content,
      });
      setEditing(null);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to save');
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    setBusy(true);
    try {
      await deleteWhatsNewPrompt(id);
      await refresh();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Failed to delete');
      setBusy(false);
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          What's New Prompts
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage the release notes shown to users upon opening the app. Only one prompt can be active at a time.
        </div>
      </MotionSection>

      {err && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </div>
      )}

      {editing ? (
        <MotionPanel className="mt-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-lg font-black text-slate-900 dark:text-slate-100 mb-4">
              {editing.id ? 'Edit Prompt' : 'Create New Prompt'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={editing.is_active || false}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                  className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-700 dark:bg-slate-950"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Active (Display this in the app)
                </span>
              </label>

              <div>
                <label className="block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
                  Version Tag (e.g. v1.2.0)
                </label>
                <input
                  type="text"
                  value={editing.version_name || ''}
                  onChange={(e) => setEditing({ ...editing, version_name: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="v1.0.0"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={editing.title || ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="What's new in this release!"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-1">
                  Content (Markdown supported)
                </label>
                <textarea
                  value={editing.content || ''}
                  onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                  rows={8}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="• Feature A&#10;• Feature B"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-2xl bg-brand-600 py-3 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
                >
                  {busy ? 'Saving...' : 'Save Prompt'}
                </button>
              </div>
            </form>
          </div>
        </MotionPanel>
      ) : (
        <MotionPanel className="mt-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                All Prompts
              </h3>
              <button
                onClick={() => setEditing({ is_active: false })}
                className="rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-black text-white shadow-soft hover:bg-brand-700"
              >
                + New Prompt
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Version</th>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Updated</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <td className="px-3 py-3">
                        {item.is_active ? (
                          <span className="inline-flex rounded-xl bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded-xl bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {item.version_name}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {fmt(item.updated_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditing(item)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && !busy && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400"
                      >
                        No prompts found. Create one to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      )}
    </div>
  );
}
