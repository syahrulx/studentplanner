import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteUserReport,
  listUserReports,
  updateUserReportStatus,
  type AdminUserReportRow,
  type UserReportKind,
  type UserReportStatus,
} from '../lib/api';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

const KIND_LABEL: Record<UserReportKind, string> = {
  bug: 'Bug / crash',
  issue: 'Something broken',
  faq: 'Question / FAQ',
  app_complaint: 'App complaint',
  user_complaint: 'User complaint',
  other: 'Other',
};

const KIND_TONE: Record<UserReportKind, 'rose' | 'amber' | 'blue' | 'violet' | 'pink' | 'slate'> = {
  bug: 'rose',
  issue: 'amber',
  faq: 'blue',
  app_complaint: 'violet',
  user_complaint: 'pink',
  other: 'slate',
};

const STATUS_LABEL: Record<UserReportStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_TONE: Record<UserReportStatus, 'amber' | 'blue' | 'green' | 'slate'> = {
  open: 'amber',
  in_progress: 'blue',
  resolved: 'green',
  dismissed: 'slate',
};

type ChipTone = 'rose' | 'amber' | 'blue' | 'violet' | 'pink' | 'green' | 'slate';

function Chip({ children, tone }: { children: string; tone: ChipTone }) {
  const cls: Record<ChipTone, string> = {
    green:
      'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100',
    amber:
      'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100',
    rose:
      'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100',
    blue:
      'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100',
    violet:
      'border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-900/40 dark:bg-violet-950/40 dark:text-violet-100',
    pink:
      'border-pink-200 bg-pink-50 text-pink-900 dark:border-pink-900/40 dark:bg-pink-950/40 dark:text-pink-100',
    slate:
      'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-black uppercase tracking-wide ${cls[tone]}`}
    >
      {children}
    </span>
  );
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id: string | null | undefined): string {
  if (!id) return '-';
  return id.slice(0, 8);
}

type RowLimit = 50 | 100 | 200 | 500;

export function UserReportsRoute() {
  const { searchQuery: globalSearch } = useAdminSearch();

  const [items, setItems] = useState<AdminUserReportRow[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserReportStatus | 'all'>('open');
  const [kindFilter, setKindFilter] = useState<UserReportKind | 'all'>('all');
  const [rowLimit, setRowLimit] = useState<RowLimit>(100);

  const [selected, setSelected] = useState<AdminUserReportRow | null>(null);

  async function refresh() {
    setBusy(true);
    setErr(null);
    try {
      const res = await listUserReports({
        status: statusFilter,
        kind: kindFilter,
        query: query.trim(),
        limit: Number(rowLimit),
        offset: 0,
      });
      setItems(res.items);
      setCount(res.count);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter, rowLimit]);

  const filteredItems = useMemo(() => {
    const q = (globalSearch || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const hay = [
        r.subject,
        r.message,
        r.reporter_name_snapshot,
        r.reporter_email_snapshot,
        r.target_user_handle,
        r.reporter_id,
      ]
        .filter((x): x is string => !!x)
        .map((s) => s.toLowerCase());
      return hay.some((h) => h.includes(q));
    });
  }, [items, globalSearch]);

  async function changeStatus(row: AdminUserReportRow, newStatus: UserReportStatus, adminNotes?: string | null) {
    try {
      const res = await updateUserReportStatus(row.id, newStatus, adminNotes);
      const updated = res.row;
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      if (selected?.id === row.id) setSelected(updated);
    } catch (e) {
      alert(`Could not update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function removeRow(row: AdminUserReportRow) {
    if (!confirm(`Permanently delete this report from ${row.reporter_name_snapshot || 'unknown user'}?`)) {
      return;
    }
    try {
      await deleteUserReport(row.id);
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      if (selected?.id === row.id) setSelected(null);
    } catch (e) {
      alert(`Could not delete report: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          User Reports
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Bug reports, complaints, FAQ questions and user-vs-user reports submitted from the mobile Settings screen.
        </div>
      </MotionSection>

      <MotionSection delay={0.05} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:flex-wrap">
                <label className="block min-w-[220px] flex-1">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Search
                  </div>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') refresh();
                    }}
                    placeholder="Subject, message, reporter name/email…"
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block lg:w-44">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Status
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as UserReportStatus | 'all')}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </label>

                <label className="block lg:w-44">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Type
                  </div>
                  <select
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as UserReportKind | 'all')}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="all">All types</option>
                    <option value="bug">Bug / crash</option>
                    <option value="issue">Something broken</option>
                    <option value="faq">Question / FAQ</option>
                    <option value="app_complaint">App complaint</option>
                    <option value="user_complaint">User complaint</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="block lg:w-36">
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Show
                  </div>
                  <select
                    value={rowLimit}
                    onChange={(e) => setRowLimit(Number(e.target.value) as RowLimit)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                  </select>
                </label>
              </div>

              <button
                onClick={refresh}
                disabled={busy}
                className="h-11 shrink-0 rounded-2xl bg-brand-600 px-5 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
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
              Showing {filteredItems.length} of {count}
            </div>

            <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
                  <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-600 dark:bg-slate-950 dark:text-slate-300">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reporter</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400"
                        >
                          {busy ? 'Loading…' : 'No reports match these filters.'}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((r) => (
                        <tr
                          key={r.id}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-950"
                          onClick={() => setSelected(r)}
                        >
                          <td className="whitespace-nowrap px-4 py-3 align-top text-xs font-semibold text-slate-600 dark:text-slate-300">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {r.reporter_name_snapshot || '(no name)'}
                            </div>
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {r.reporter_email_snapshot || '—'}
                            </div>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                              {shortId(r.reporter_id)}…
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Chip tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind] || r.kind}</Chip>
                            {r.target_user_handle ? (
                              <div className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                vs <span className="font-bold">{r.target_user_handle}</span>
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="max-w-[36ch] truncate font-bold text-slate-900 dark:text-slate-100">
                              {r.subject}
                            </div>
                            <div className="mt-0.5 max-w-[42ch] truncate text-xs text-slate-500 dark:text-slate-400">
                              {r.message}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
                          </td>
                          <td className="px-4 py-3 text-right align-top">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(r);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-950"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>

      {selected
        ? createPortal(
            <ReportDetailModal
              row={selected}
              onClose={() => setSelected(null)}
              onChangeStatus={(s, notes) => changeStatus(selected, s, notes)}
              onDelete={() => removeRow(selected)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function ReportDetailModal({
  row,
  onClose,
  onChangeStatus,
  onDelete,
}: {
  row: AdminUserReportRow;
  onClose: () => void;
  onChangeStatus: (status: UserReportStatus, adminNotes: string | null) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? '');
  useEffect(() => {
    setNotes(row.admin_notes ?? '');
  }, [row.id, row.admin_notes]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind] || row.kind}</Chip>
              <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {formatDateTime(row.created_at)}
              </div>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              {row.subject}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-950"
          >
            Close
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Reporter name">{row.reporter_name_snapshot || '(no name)'}</Detail>
          <Detail label="Reporter email">{row.reporter_email_snapshot || '—'}</Detail>
          <Detail label="Reporter id" mono>{row.reporter_id || '—'}</Detail>
          <Detail label="Reported user handle">{row.target_user_handle || '—'}</Detail>
          <Detail label="Platform">{row.platform || '—'}</Detail>
          <Detail label="App version">{row.app_version || '—'}</Detail>
        </div>

        <div className="mt-5">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Message
          </div>
          <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
            {row.message}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Admin notes (private)
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Internal notes for the team…"
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <StatusButton
            active={row.status === 'open'}
            tone="amber"
            onClick={() => onChangeStatus('open', notes)}
          >
            Mark open
          </StatusButton>
          <StatusButton
            active={row.status === 'in_progress'}
            tone="blue"
            onClick={() => onChangeStatus('in_progress', notes)}
          >
            In progress
          </StatusButton>
          <StatusButton
            active={row.status === 'resolved'}
            tone="green"
            onClick={() => onChangeStatus('resolved', notes)}
          >
            Resolved
          </StatusButton>
          <StatusButton
            active={row.status === 'dismissed'}
            tone="slate"
            onClick={() => onChangeStatus('dismissed', notes)}
          >
            Dismiss
          </StatusButton>

          <div className="ml-auto">
            <button
              onClick={onDelete}
              className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100"
            >
              Delete report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div
        className={`mt-0.5 break-words text-sm font-semibold text-slate-900 dark:text-slate-100 ${
          mono ? 'font-mono text-[12px]' : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function StatusButton({
  children,
  active,
  tone,
  onClick,
}: {
  children: string;
  active: boolean;
  tone: 'amber' | 'blue' | 'green' | 'slate';
  onClick: () => void;
}) {
  const base =
    'rounded-2xl border px-4 py-2 text-xs font-black transition hover:translate-y-[-1px]';
  const styles: Record<string, string> = {
    amber:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100',
    blue:
      'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-100',
    green:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100',
    slate:
      'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200',
  };
  return (
    <button onClick={onClick} className={`${base} ${styles[tone]} ${active ? 'ring-2 ring-offset-1' : ''}`}>
      {children}
    </button>
  );
}
