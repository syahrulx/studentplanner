import { useEffect, useMemo, useState } from 'react';
import { deleteCircleAdmin, listCircleMembers, listCircles, removeCircleMember, updateCircle, type AdminCircleMemberRow, type AdminCircleRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

export function CirclesRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AdminCircleRow[]>([]);
  const [selected, setSelected] = useState<AdminCircleRow | null>(null);
  const [members, setMembers] = useState<AdminCircleMemberRow[]>([]);
  const [membersBusy, setMembersBusy] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [editingEmoji, setEditingEmoji] = useState('');

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const rows = await listCircles({ query: query.trim() || undefined, limit: 300 });
      setItems(rows);
      // keep selected in sync
      if (selected) {
        const match = rows.find((r) => r.id === selected.id) ?? null;
        setSelected(match);
        setEditingName(match?.name ?? '');
        setEditingEmoji(match?.emoji ?? '');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load circles');
    } finally {
      setBusy(false);
    }
  };

  const refreshMembers = async (circleId: string) => {
    setMembersBusy(true);
    try {
      const rows = await listCircleMembers({ circleId, limit: 500 });
      setMembers(rows);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setMembersBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let rows = items;
    if (searchQuery.trim()) {
      rows = rows.filter((c) => matchesAdminSearch(searchQuery, c.id, c.name, c.invite_code, c.created_by, c.created_at));
    }
    return rows;
  }, [items, searchQuery]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Circles</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Manage circles, members, and basic circle metadata.
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <label className="block flex-1">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Search</div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Circle name"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
            >
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_420px]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="px-3 py-2">Circle</th>
                    <th className="px-3 py-2">Invite code</th>
                    <th className="px-3 py-2">Members</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => {
                    const isSelected = selected?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        className={[
                          'cursor-pointer rounded-2xl border transition',
                          isSelected
                            ? 'border-brand-500 bg-brand-600/10 dark:bg-brand-400/10'
                            : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/70',
                        ].join(' ')}
                        onClick={() => {
                          if (isSelected) {
                            setSelected(null);
                            setMembers([]);
                            setEditingName('');
                            setEditingEmoji('');
                            return;
                          }
                          setSelected(c);
                          setEditingName(c.name);
                          setEditingEmoji(c.emoji ?? '');
                          void refreshMembers(c.id);
                        }}
                      >
                      <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-slate-100">
                        {c.emoji ? `${c.emoji} ` : ''}
                        {c.name}
                        <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">{c.id}</div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{c.invite_code}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{c.member_count}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                        {formatDate(c.created_at)}
                      </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !busy ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                        No circles found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950/40">
              <div className="text-sm font-black text-slate-900 dark:text-slate-100">Circle details</div>
              <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Select a circle to manage.</div>

              {selected ? (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Name</div>
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Emoji</div>
                    <input
                      value={editingEmoji}
                      onChange={(e) => setEditingEmoji(e.target.value)}
                      placeholder="Optional"
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </label>

                  <div className="flex gap-2">
                    <button
                      className="h-11 flex-1 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
                      disabled={!editingName.trim()}
                      onClick={async () => {
                        try {
                          const row = await updateCircle({ id: selected.id, name: editingName.trim(), emoji: editingEmoji.trim() || undefined });
                          setSelected(row);
                          await refresh();
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : 'Failed to update circle');
                        }
                      }}
                    >
                      Save
                    </button>
                    <button
                      className="h-11 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-900 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100"
                      onClick={async () => {
                        if (!confirm(`Delete circle “${selected.name}”? This removes all members.`)) return;
                        try {
                          await deleteCircleAdmin({ id: selected.id });
                          setSelected(null);
                          setMembers([]);
                          await refresh();
                        } catch (e) {
                          setErr(e instanceof Error ? e.message : 'Failed to delete circle');
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="pt-2">
                    <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Members {membersBusy ? '(loading…)': ''}
                    </div>
                    <div className="mt-2 max-h-[42vh] overflow-auto rounded-2xl border border-slate-200 bg-white/60 dark:border-slate-800 dark:bg-slate-950/40">
                      {members.map((m) => (
                        <div key={m.user_id} className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 last:border-b-0 dark:border-slate-800">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black text-slate-900 dark:text-slate-100">
                              {m.profile?.name ?? m.user_id}
                            </div>
                            <div className="truncate font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {m.user_id} · {m.role}
                            </div>
                          </div>
                          <button
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                            onClick={async () => {
                              if (!confirm('Remove this member from the circle?')) return;
                              try {
                                await removeCircleMember({ circleId: selected.id, userId: m.user_id });
                                await refreshMembers(selected.id);
                                await refresh();
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : 'Failed to remove member');
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {members.length === 0 && !membersBusy ? (
                        <div className="px-3 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400">No members.</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </MotionPanel>
    </div>
  );
}

