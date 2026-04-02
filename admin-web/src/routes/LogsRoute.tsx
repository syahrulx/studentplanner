import { useEffect, useState } from 'react';
import { listAdminLogs, type AdminLogRow } from '../lib/api';

type LogRow = AdminLogRow;

export function LogsRoute() {
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  const [selected, setSelected] = useState<LogRow | null>(null);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listAdminLogs({ type, status, limit: 200 });
      setRows(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Logs</div>
      <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
        API requests, errors, and monitoring.
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="grid flex-1 gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Type</div>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">all</option>
                  <option value="api_request">api_request</option>
                  <option value="failed_login">failed_login</option>
                  <option value="error">error</option>
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">all</option>
                  <option value="success">success</option>
                  <option value="failed">failed</option>
                </select>
              </label>
            </div>
            <button
              onClick={refresh}
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

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Meta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:bg-slate-950/70"
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-3 py-3 text-xs font-black text-slate-900 dark:text-slate-100">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.type}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.status}</td>
                    <td className="px-3 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {JSON.stringify(r.meta)?.slice(0, 120)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !busy ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                      No logs found yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && !busy ? (
            <div className="mt-3 text-xs font-semibold text-slate-500">
              Logs are recorded when you perform admin actions like <code>Test Fetch</code>, user status changes (Activate/Disable/Ban), or deleting timetable rows.
            </div>
          ) : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm font-black text-slate-900 dark:text-slate-100">Log details</div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Click a row to inspect full JSON.</div>

          {selected ? (
            <pre className="mt-4 max-h-[70vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              {JSON.stringify(selected, null, 2)}
            </pre>
          ) : (
            <div className="mt-6 text-sm font-semibold text-slate-500 dark:text-slate-400">No log selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}

