import { useEffect, useMemo, useState } from 'react';
import { deleteUser, listUsers, setUserStatus, type AdminUserRow } from '../lib/api';

function Chip({ children, tone }: { children: string; tone: 'green' | 'amber' | 'rose' | 'slate' }) {
  const cls =
    tone === 'green'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100'
        : tone === 'rose'
          ? 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100'
          : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-black ${cls}`}>{children}</span>;
}

export function UsersRoute() {
  const [query, setQuery] = useState('');
  const [universityId, setUniversityId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [count, setCount] = useState(0);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await listUsers({ query: query.trim() || undefined, universityId: universityId.trim() || undefined, limit: 50, offset: 0 });
      setItems(res.items);
      setCount(res.count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => items, [items]);

  return (
    <div>
      <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Users</div>
      <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
        Search, view, disable/ban, and delete users.
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <label className="block flex-1">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Search</div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or Student ID"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
            <label className="block md:w-64">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
              <input
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                placeholder="e.g. uitm"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>
          </div>
          <button
            onClick={refresh}
            disabled={busy}
            className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
          >
            {busy ? 'Loading…' : 'Search'}
          </button>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        ) : null}

        <div className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Showing {rows.length} of {count}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[880px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Student ID</th>
                <th className="px-3 py-2">University</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const tone = u.status === 'active' ? 'green' : u.status === 'disabled' ? 'amber' : 'rose';
                return (
                  <tr key={u.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                    <td className="px-3 py-3 text-sm font-black text-slate-900 dark:text-slate-100">{u.name || '-'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.student_id || '-'}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{u.university_id || '-'}</td>
                    <td className="px-3 py-3">
                      <Chip tone={tone}>{u.status}</Chip>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                          onClick={async () => {
                            await setUserStatus(u.id, 'active');
                            await refresh();
                          }}
                        >
                          Activate
                        </button>
                        <button
                          className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100"
                          onClick={async () => {
                            await setUserStatus(u.id, 'disabled');
                            await refresh();
                          }}
                        >
                          Disable
                        </button>
                        <button
                          className="h-9 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-900 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100"
                          onClick={async () => {
                            await setUserStatus(u.id, 'banned');
                            await refresh();
                          }}
                        >
                          Ban
                        </button>
                        <button
                          className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                          onClick={async () => {
                            const ok = confirm('Delete user permanently? This also deletes auth user.');
                            if (!ok) return;
                            await deleteUser(u.id);
                            await refresh();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !busy ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

