import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Label, TextInput, Textarea } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, SkeletonRows } from '../ui/page';
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

  // Display only: the prompt that is live now (saving another as active turns it off).
  const liveNow = items.find((item) => item.is_active);
  const newButton = (
    <Button onClick={() => setEditing({ is_active: false })}>+ New prompt</Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="What's new"
        description="Manage the release notes shown to users upon opening the app. Only one prompt can be active at a time."
        actions={editing ? undefined : newButton}
      />

      {err ? <Notice tone="danger">{err}</Notice> : null}

      {editing ? (
        <Panel title={editing.id ? 'Edit prompt' : 'New prompt'}>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
              <div>
                <Label htmlFor="whats-new-version">Version tag</Label>
                <TextInput
                  id="whats-new-version"
                  className="mt-1"
                  value={editing.version_name || ''}
                  onChange={(e) => setEditing({ ...editing, version_name: e.target.value })}
                  placeholder="v1.0.0"
                />
              </div>
              <div>
                <Label htmlFor="whats-new-title">Title</Label>
                <TextInput
                  id="whats-new-title"
                  className="mt-1"
                  value={editing.title || ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="What's new in this release!"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="whats-new-content">Content (Markdown supported)</Label>
              <Textarea
                id="whats-new-content"
                className="mt-1 text-sm"
                value={editing.content || ''}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                rows={10}
                placeholder="• Feature A&#10;• Feature B"
              />
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <input
                type="checkbox"
                checked={editing.is_active || false}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600 dark:border-slate-700 dark:bg-slate-950"
              />
              <span>
                <span className="block text-sm font-black text-slate-800 dark:text-slate-100">Active (show this in the app)</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {liveNow && liveNow.id !== editing.id
                    ? `Saving this as active turns off the one live now (${liveNow.version_name}).`
                    : 'Only one prompt is shown at a time. Saving this as active turns off any other active one.'}
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving...' : 'Save prompt'}
              </Button>
            </div>
          </form>
        </Panel>
      ) : busy && items.length === 0 ? (
        <SkeletonRows rows={3} height="h-16" />
      ) : items.length === 0 ? (
        <EmptyState title="No prompts yet">
          Use “New prompt” above to create one.
        </EmptyState>
      ) : (
        <Panel padded={false}>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={item.is_active ? 'success' : 'neutral'}>{item.is_active ? 'Active' : 'Inactive'}</Chip>
                    <span className="text-xs font-black text-slate-500 dark:text-slate-400">{item.version_name}</span>
                  </div>
                  <div className="mt-1 truncate text-sm font-black text-slate-900 dark:text-slate-100">{item.title}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Updated {fmt(item.updated_at)}</div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(item)}>
                    Edit
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="h-9 rounded-2xl px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
