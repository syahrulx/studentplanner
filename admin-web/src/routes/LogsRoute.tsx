import { useEffect, useMemo, useState } from 'react';
import { listAdminLogs, type AdminLogRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { Button } from '../ui/Button';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows } from '../ui/page';

const TYPE_OPTIONS = ['all', 'api_request', 'failed_login', 'error'] as const;
const STATUS_OPTIONS = ['all', 'success', 'failed'] as const;

/** Plain label for a log type / status value (the value sent to the server is unchanged). */
function prettyValue(v: string) {
  if (v === 'all') return 'All';
  const t = v.replace(/_/g, ' ');
  return t[0].toUpperCase() + t.slice(1);
}

type LogRow = AdminLogRow;

export function LogsRoute() {
  const { searchQuery } = useAdminSearch();
  const [type, setType] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<LogRow[]>([]);
  // Display only: which filters the rows on screen were loaded with, so the
  // page can say when a changed filter still needs "Apply".
  const [loadedWith, setLoadedWith] = useState({ type: 'all', status: 'all' });
  const [selected, setSelected] = useState<LogRow | null>(null);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listAdminLogs({ type, status, limit: 200 });
      setRows(items);
      setLoadedWith({ type, status });
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

  const rowsFiltered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    return rows.filter((r) =>
      matchesAdminSearch(
        searchQuery,
        r.id,
        r.type,
        r.status,
        r.created_at,
        typeof r.meta === 'object' && r.meta != null ? JSON.stringify(r.meta) : String(r.meta ?? ''),
      ),
    );
  }, [rows, searchQuery]);

  const pending = type !== loadedWith.type || status !== loadedWith.status;
  const searching = searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      <MotionSection>
        <PageHeader
          title="Logs"
          description="API requests, failed logins and errors. Newest 200 for the chosen filters."
          actions={
            <Button type="button" onClick={refresh} disabled={busy} variant={pending ? 'primary' : 'secondary'}>
              {busy ? 'Loading…' : pending ? 'Apply filters' : 'Refresh'}
            </Button>
          }
        />
      </MotionSection>

      <MotionPanel>
        <Panel padded>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div role="group" aria-label="Filter by type">
              <PillGroup label="Type">
                {TYPE_OPTIONS.map((v) => (
                  <Pill key={v} active={type === v} onClick={() => setType(v)}>{prettyValue(v)}</Pill>
                ))}
              </PillGroup>
            </div>
            <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-700 lg:block" aria-hidden />
            <div role="group" aria-label="Filter by status">
              <PillGroup label="Status">
                {STATUS_OPTIONS.map((v) => (
                  <Pill key={v} active={status === v} onClick={() => setStatus(v)}>{prettyValue(v)}</Pill>
                ))}
              </PillGroup>
            </div>
          </div>
          <div className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {pending
              ? 'Filters changed. Press "Apply filters" to load matching logs.'
              : `${rows.length} loaded${searching ? `, ${rowsFiltered.length} match the top search (including JSON meta)` : ''}.`}
          </div>
        </Panel>
      </MotionPanel>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <MotionPanel className="min-w-0">
          <Panel padded={false}>
            {busy && rows.length === 0 ? (
              <div className="p-5"><SkeletonRows rows={5} height="h-12" /></div>
            ) : rowsFiltered.length === 0 ? (
              <div className="p-5">
                {searching && rows.length > 0 ? (
                  <EmptyState title="No logs match the top search." />
                ) : (
                  <EmptyState title="No logs found yet.">
                    Logs are recorded when you perform admin actions like <code>Test Fetch</code>, user status changes (Activate/Disable/Ban), or deleting timetable rows.
                  </EmptyState>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Logs">
                {rowsFiltered.map((r) => {
                  const isSelected = selected?.id === r.id;
                  const failed = r.status === 'failed';
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        aria-pressed={isSelected}
                        className={`block w-full px-5 py-3 text-left transition ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-slate-800'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone={failed ? 'danger' : r.status === 'success' ? 'success' : 'neutral'}>{r.status}</Chip>
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.type}</span>
                          <span className="ml-auto text-xs font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {JSON.stringify(r.meta)?.slice(0, 120)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </MotionPanel>

        <MotionPanel className="min-w-0 lg:sticky lg:top-4">
          <Panel title="Log details" description={selected ? undefined : 'Pick a log to see its full JSON.'}>
            {selected ? (
              <pre className="max-h-[70vh] overflow-auto rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-900 dark:bg-slate-950 dark:text-slate-100">
                {JSON.stringify(selected, null, 2)}
              </pre>
            ) : (
              <div className="text-sm font-semibold text-slate-400 dark:text-slate-500">No log selected.</div>
            )}
          </Panel>
        </MotionPanel>
      </div>
    </div>
  );
}
