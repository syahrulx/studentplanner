import { useEffect, useMemo, useState } from 'react';
import {
  deleteUserReport,
  listSupportAdmins,
  listUserReports,
  replyToUserReport,
  updateUserReportStatus,
  updateUserReportWorkflow,
  type AdminUserReportRow,
  type UserReportKind,
  type UserReportStatus,
  type SupportAdminOption,
  type SupportWorkflowState,
} from '../lib/api';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionSection } from '../ui/motion';
import { useSafeActionDialog } from '../components/SafeActionDialog';
import { Button } from '../ui/Button';
import { Label, Select, TextInput } from '../ui/Input';
import { Chip, EmptyState, Notice, PageHeader, Panel, Pill, PillGroup, SkeletonRows, StatItem, StatStrip } from '../ui/page';
import { ReportDetailPanel } from '../components/moderation/ReportDetailPanel';
import {
  KIND_LABEL,
  KIND_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  WORKFLOW_LABEL,
  formatDateTime,
  hasNewUserReply,
  shortId,
} from '../components/moderation/reportFormat';

type RowLimit = 25 | 50 | 100 | 200;

const STATUS_FILTERS: { value: UserReportStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'dismissed', label: 'Dismissed' },
];

export function UserReportsRoute() {
  const { searchQuery: globalSearch } = useAdminSearch();

  const [items, setItems] = useState<AdminUserReportRow[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserReportStatus | 'all'>('open');
  const [kindFilter, setKindFilter] = useState<UserReportKind | 'all'>('all');
  const [workflowFilter, setWorkflowFilter] = useState<SupportWorkflowState | 'all'>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'last_user_reply'>('newest');
  const [rowLimit, setRowLimit] = useState<RowLimit>(100);
  const [page, setPage] = useState(0);
  const [admins, setAdmins] = useState<SupportAdminOption[]>([]);

  const [selected, setSelected] = useState<AdminUserReportRow | null>(null);
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();

  async function refresh(targetPage = page) {
    setBusy(true);
    setErr(null);
    try {
      const res = await listUserReports({
        status: statusFilter,
        kind: kindFilter,
        query: query.trim(),
        limit: Number(rowLimit),
        offset: targetPage * rowLimit,
        workflowState: workflowFilter,
        assignedAdminId: assignedFilter as 'all' | 'unassigned',
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        sort,
      });
      setItems(res.items);
      setCount(res.count);
      setPage(targetPage);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, kindFilter, workflowFilter, assignedFilter, rowLimit]);

  useEffect(() => {
    void listSupportAdmins().then(setAdmins).catch(() => setAdmins([]));
  }, []);

  const filteredItems = useMemo(() => {
    const q = (globalSearch || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const hay = [
        r.subject,
        r.message,
        r.reporter_name_snapshot,
        r.reporter_email_snapshot,
        r.contact_info,
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
      setErr(`Could not update status: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function removeRow(row: AdminUserReportRow) {
    requestSafeAction({
      title: 'Permanently delete support report', operation: 'Delete report', affectedCount: 1,
      subject: `${row.id} · ${row.subject}`, confirmationText: row.id.slice(0, 8), requireReason: true,
      irreversible: true, warning: 'This permanently removes the report and conversation. Undo is unavailable.',
      onConfirm: async (reason) => {
        await deleteUserReport(row.id, reason);
        setItems((prev) => prev.filter((report) => report.id !== row.id));
        if (selected?.id === row.id) setSelected(null);
        return { affected: 1 };
      },
    });
  }

  async function changeWorkflow(row: AdminUserReportRow, patch: Parameters<typeof updateUserReportWorkflow>[1]) {
    const res = await updateUserReportWorkflow(row.id, patch);
    setItems((prev) => prev.map((item) => item.id === row.id ? res.row : item));
    if (selected?.id === row.id) setSelected(res.row);
  }

  const pageCount = Math.max(1, Math.ceil(count / rowLimit));
  const queueMetrics = useMemo(() => {
    const now = Date.now();
    return {
      unassigned: items.filter((row) => !row.assigned_admin_id).length,
      newReplies: items.filter((row) => row.last_user_reply_at && (!row.last_admin_reply_at || row.last_user_reply_at > row.last_admin_reply_at)).length,
      responseOverdue: items.filter((row) => !row.first_admin_response_at && now - new Date(row.created_at).getTime() > 24 * 60 * 60 * 1000).length,
    };
  }, [items]);

  async function reply(row: AdminUserReportRow, body: string, status: UserReportStatus) {
    const res = await replyToUserReport(row.id, body, status);
    setItems((prev) => prev.map((item) => (item.id === row.id ? res.row : item)));
    if (selected?.id === row.id) setSelected(res.row);
    return res.message;
  }


  const ownerEmail = (row: AdminUserReportRow) =>
    admins.find((admin) => admin.user_id === row.assigned_admin_id)?.email ?? 'Unassigned';

  return (
    <div className="space-y-5">
      <PageHeader
        title="User reports"
        description="Bug reports, complaints, questions and user-vs-user reports sent from the app's Settings screen."
      />

      <MotionSection>
        <StatStrip>
          <StatItem
            label="Unassigned"
            value={queueMetrics.unassigned}
            hint="On this page"
            tone={queueMetrics.unassigned > 0 ? 'warning' : 'neutral'}
          />
          <StatItem
            label="New user replies"
            value={queueMetrics.newReplies}
            hint="On this page"
            tone={queueMetrics.newReplies > 0 ? 'danger' : 'neutral'}
          />
          <StatItem
            label="First reply late"
            value={queueMetrics.responseOverdue}
            hint="No admin reply after 24h · on this page"
            tone={queueMetrics.responseOverdue > 0 ? 'danger' : 'neutral'}
          />
        </StatStrip>
      </MotionSection>

      <MotionSection delay={0.04}>
        <Panel>
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') refresh();
                }}
                placeholder="Report ID, user ID, subject, name or email…"
                aria-label="Search reports"
                className="flex-1"
              />
              <Button onClick={() => void refresh(0)} disabled={busy} className="shrink-0">
                {busy ? 'Loading…' : 'Search'}
              </Button>
            </div>

            <PillGroup label="Status">
              {STATUS_FILTERS.map((f) => (
                <Pill key={f.value} active={statusFilter === f.value} onClick={() => setStatusFilter(f.value)}>
                  {f.label}
                </Pill>
              ))}
            </PillGroup>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <div>
                <Label htmlFor="ur-kind" className="mb-1">Type</Label>
                <Select id="ur-kind" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as UserReportKind | 'all')}>
                  <option value="all">All types</option>
                  <option value="bug">Bug / crash</option>
                  <option value="issue">Something broken</option>
                  <option value="faq">Question / FAQ</option>
                  <option value="app_complaint">App complaint</option>
                  <option value="user_complaint">User complaint</option>
                  <option value="semester_calendar">Semester / calendar</option>
                  <option value="campus_request">Campus request</option>
                  <option value="grading">Grading</option>
                  <option value="widget">Home-screen widget</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ur-workflow" className="mb-1">Workflow</Label>
                <Select id="ur-workflow" value={workflowFilter} onChange={(e) => setWorkflowFilter(e.target.value as SupportWorkflowState | 'all')}>
                  <option value="all">All workflow states</option>
                  {Object.entries(WORKFLOW_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="ur-assigned" className="mb-1">Assigned admin</Label>
                <Select id="ur-assigned" value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
                  <option value="all">All assignments</option><option value="unassigned">Unassigned</option>
                  {admins.map((admin) => <option key={admin.user_id} value={admin.user_id}>{admin.email}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="ur-sort" className="mb-1">Sort</Label>
                <Select id="ur-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                  <option value="newest">Newest report</option>
                  <option value="oldest">Oldest report</option>
                  <option value="last_user_reply">Latest user reply</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="ur-from" className="mb-1">From</Label>
                <TextInput id="ur-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ur-to" className="mb-1">To</Label>
                <TextInput id="ur-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ur-limit" className="mb-1">Show</Label>
                <Select id="ur-limit" value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value) as RowLimit)}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </Select>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              Status, type, workflow, admin and “Show” apply straight away. Search text, dates and sort apply when you press Search.
            </p>
          </div>
        </Panel>
      </MotionSection>

      {err ? <Notice tone="danger">{err}</Notice> : null}

      <MotionSection delay={0.08}>
        <Panel title="Reports" description={`Showing ${filteredItems.length} of ${count}`} padded={false}>
          {filteredItems.length === 0 ? (
            <div className="p-5">
              {busy ? <SkeletonRows rows={4} height="h-20" /> : <EmptyState title="No reports match these filters." />}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredItems.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 md:grid-cols-[minmax(0,1fr)_auto] dark:hover:bg-slate-800/40 dark:focus-visible:bg-slate-800/40"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind] || r.kind}</Chip>
                        <Chip tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Chip>
                        <Chip>{WORKFLOW_LABEL[r.workflow_state ?? 'new']}</Chip>
                        {hasNewUserReply(r) ? <Chip tone="danger">New user reply</Chip> : null}
                      </div>
                      <div className="mt-2 truncate font-bold text-slate-900 dark:text-slate-100">{r.subject}</div>
                      <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{r.message}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-700 dark:text-slate-200">{r.reporter_name_snapshot || '(no name)'}</span>
                        <span>{r.reporter_email_snapshot || '—'}</span>
                        {r.contact_info ? (
                          <span className="text-brand-700 dark:text-brand-300">Contact: {r.contact_info}</span>
                        ) : null}
                        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">{shortId(r.reporter_id)}…</span>
                        {r.target_user_handle ? (
                          <span>vs <span className="font-bold text-slate-700 dark:text-slate-200">{r.target_user_handle}</span></span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs font-semibold text-slate-500 md:flex-col md:items-end md:gap-1 dark:text-slate-400">
                      <span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span>
                      <span className="max-w-[220px] truncate" title="Assigned admin">{ownerEmail(r)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
            <Button size="sm" variant="secondary" disabled={busy || page === 0} onClick={() => void refresh(page - 1)}>Previous</Button>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Page {page + 1} of {pageCount}</span>
            <Button size="sm" variant="secondary" disabled={busy || page + 1 >= pageCount} onClick={() => void refresh(page + 1)}>Next</Button>
          </div>
        </Panel>
      </MotionSection>

      {selected ? (
        <ReportDetailPanel
          row={selected}
          onClose={() => setSelected(null)}
          onChangeStatus={(s, notes) => changeStatus(selected, s, notes)}
          onReply={(body, status) => reply(selected, body, status)}
          onDelete={() => removeRow(selected)}
          admins={admins}
          onWorkflow={(patch) => changeWorkflow(selected, patch)}
        />
      ) : null}
      {safeActionDialog}
    </div>
  );
}
