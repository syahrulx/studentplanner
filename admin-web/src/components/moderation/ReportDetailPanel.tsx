import { useEffect, useState, type ReactNode } from 'react';
import {
  getUserAiSummary,
  listUserReportMessages,
  updateUserReportWorkflow,
  type AdminSupportReportMessage,
  type AdminUserReportRow,
  type SupportAdminOption,
  type SupportEscalationLevel,
  type SupportWorkflowState,
  type UserAiSummary,
  type UserReportStatus,
} from '../../lib/api';
import { Button } from '../../ui/Button';
import { Label, Select, TextInput, Textarea } from '../../ui/Input';
import { cn } from '../../ui/cn';
import { Chip, FactGrid, Notice, SidePanel } from '../../ui/page';
import {
  KIND_LABEL,
  KIND_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  WORKFLOW_LABEL,
  formatDateTime,
  responseDuration,
} from './reportFormat';

function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2">
      <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{children}</h3>
      {hint ? <p className="mt-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{hint}</p> : null}
    </div>
  );
}

const STATUS_ACTIONS: { status: UserReportStatus; label: string }[] = [
  { status: 'open', label: 'Mark open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'resolved', label: 'Resolved' },
  { status: 'dismissed', label: 'Dismiss' },
];

/** One support report: message, conversation, handling, notes and reporter facts. */
export function ReportDetailPanel({
  row,
  onClose,
  onChangeStatus,
  onReply,
  onDelete,
  admins,
  onWorkflow,
}: {
  row: AdminUserReportRow;
  onClose: () => void;
  onChangeStatus: (status: UserReportStatus, adminNotes: string | null) => void | Promise<void>;
  onReply: (body: string, status: UserReportStatus) => Promise<AdminSupportReportMessage>;
  onDelete: () => void;
  admins: SupportAdminOption[];
  onWorkflow: (patch: Parameters<typeof updateUserReportWorkflow>[1]) => void | Promise<void>;
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? '');
  // Who this person is and how much AI they have left. Loaded here rather than
  // with the list: the list would need one lookup per row to show something an
  // admin only reads once they have opened a report.
  const [ai, setAi] = useState<UserAiSummary | null>(null);
  const [aiError, setAiError] = useState('');
  const [messages, setMessages] = useState<AdminSupportReportMessage[]>([]);
  const [reply, setReply] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState('');

  useEffect(() => {
    let active = true;
    const uid = row.reporter_id;
    if (!uid) { setAi(null); return; }
    setAi(null);
    setAiError('');
    getUserAiSummary(uid)
      .then((res) => { if (active) setAi(res); })
      .catch((e) => { if (active) setAiError(e instanceof Error ? e.message : 'Could not load plan'); });
    return () => { active = false; };
  }, [row.reporter_id]);
  const [tags, setTags] = useState((row.internal_tags ?? []).join(', '));
  const [escalationReason, setEscalationReason] = useState(row.escalation_reason ?? '');
  useEffect(() => {
    setNotes(row.admin_notes ?? '');
  }, [row.id, row.admin_notes]);
  useEffect(() => {
    let active = true;
    void listUserReportMessages(row.id).then((result) => {
      if (active) setMessages(result.items);
    }).catch(() => { if (active) setMessages([]); });
    return () => { active = false; };
  }, [row.id]);

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || replyBusy) return;
    setReplyBusy(true);
    setReplyError('');
    try {
      const message = await onReply(body, row.status === 'resolved' ? 'in_progress' : row.status);
      setMessages((current) => [...current, message]);
      setReply('');
    } catch (error) {
      setReplyError(`Could not send reply: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setReplyBusy(false);
    }
  };

  const plan = aiError
    ? <span className="text-rose-600 dark:text-rose-400">{aiError}</span>
    : !ai
      ? '…'
      : (
        <span>
          <span className="uppercase">{ai.plan}</span>
          {ai.subscriptionStatus ? ` · ${ai.subscriptionStatus}` : ''}
          {ai.subscriptionExpires
            ? ` · until ${new Date(ai.subscriptionExpires).toLocaleDateString()}`
            : ''}
        </span>
      );

  const aiMonth = !ai ? '…' : (
    <span>
      {ai.monthlyTokensUsed.toLocaleString()} / {ai.monthlyTokenLimit.toLocaleString()} tokens
      {' · '}
      <span className={ai.monthlyTokenLimit - ai.monthlyTokensUsed <= 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
        {Math.max(0, ai.monthlyTokenLimit - ai.monthlyTokensUsed).toLocaleString()} left
      </span>
      {ai.limitIsOverride ? ' (custom limit)' : ''}
    </span>
  );

  const aiToday = !ai ? '…' : (
    <span>
      {ai.dailyRequestsUsed} / {ai.dailyRequestLimit} requests
      {' · '}
      <span className={ai.dailyRequestLimit - ai.dailyRequestsUsed <= 0 ? 'text-rose-600 dark:text-rose-400' : ''}>
        {Math.max(0, ai.dailyRequestLimit - ai.dailyRequestsUsed)} left
      </span>
    </span>
  );

  const mono = (value: string) => <span className="font-mono text-xs">{value}</span>;

  return (
    <SidePanel
      title={row.subject}
      subtitle={`Sent ${formatDateTime(row.created_at)}`}
      chips={<>
        <Chip tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind] || row.kind}</Chip>
        <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
      </>}
      onClose={onClose}
      width="max-w-3xl"
      footer={<>
        <button
          type="button"
          onClick={onDelete}
          className="mr-auto inline-flex h-9 items-center rounded-2xl px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:text-rose-300 dark:hover:bg-rose-950/40"
        >
          Delete report
        </button>
        <span className="self-center text-[11px] font-black uppercase tracking-wide text-slate-400">Set status</span>
        {STATUS_ACTIONS.map((a) => (
          <Button
            key={a.status}
            size="sm"
            variant={row.status === a.status ? 'primary' : 'secondary'}
            aria-pressed={row.status === a.status}
            onClick={() => onChangeStatus(a.status, notes)}
          >
            {a.label}
          </Button>
        ))}
      </>}
    >
      <section>
        <SectionTitle>Message</SectionTitle>
        <div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-medium leading-6 text-slate-800 dark:bg-slate-950/60 dark:text-slate-100">
          {row.message}
        </div>
        {row.screenshot_url ? (
          <a
            href={row.screenshot_url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block max-w-sm overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition-opacity hover:opacity-90 dark:border-slate-800"
          >
            <img src={row.screenshot_url} alt="User reported screenshot" className="h-auto w-full object-cover" />
          </a>
        ) : null}
      </section>

      <section>
        <SectionTitle>Conversation with user</SectionTitle>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          {messages.length === 0 ? (
            <div className="py-2 text-center text-sm font-semibold text-slate-400 dark:text-slate-500">No replies yet.</div>
          ) : messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'rounded-xl p-3 text-sm',
                message.author_role === 'admin'
                  ? 'ml-8 bg-brand-600 text-white'
                  : 'mr-8 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100',
              )}
            >
              <div className="mb-1 text-[10px] font-black uppercase tracking-wide opacity-70">
                {message.author_role === 'admin' ? 'Admin' : 'User'} · {formatDateTime(message.created_at)}
              </div>
              <div className="whitespace-pre-wrap font-medium">{message.body}</div>
            </div>
          ))}
        </div>
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="Reply to this user…"
          aria-label="Reply to this user"
          className="mt-3"
        />
        {replyError ? <Notice tone="danger" className="mt-2">{replyError}</Notice> : null}
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!reply.trim() || replyBusy} onClick={sendReply}>
            {replyBusy ? 'Sending…' : 'Send reply'}
          </Button>
        </div>
      </section>

      <section>
        <SectionTitle>Handling</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="report-assigned" className="mb-1">Assigned admin</Label>
            <Select
              id="report-assigned"
              value={row.assigned_admin_id ?? ''}
              onChange={(e) => void onWorkflow({ assignedAdminId: e.target.value || null, workflowState: e.target.value && (row.workflow_state ?? 'new') === 'new' ? 'assigned' : undefined })}
            >
              <option value="">Unassigned</option>
              {admins.map((admin) => <option key={admin.user_id} value={admin.user_id}>{admin.email}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="report-workflow" className="mb-1">Workflow state</Label>
            <Select
              id="report-workflow"
              value={row.workflow_state ?? 'new'}
              onChange={(e) => void onWorkflow({ workflowState: e.target.value as SupportWorkflowState })}
            >
              {Object.entries(WORKFLOW_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="report-escalation" className="mb-1">Escalation</Label>
            <Select
              id="report-escalation"
              value={row.escalation_level ?? 'none'}
              onChange={(e) => void onWorkflow({ escalationLevel: e.target.value as SupportEscalationLevel, escalationReason })}
            >
              <option value="none">Not escalated</option>
              <option value="normal">Escalated</option>
              <option value="urgent">Urgent escalation</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="report-escalation-reason" className="mb-1">Escalation reason</Label>
            <TextInput
              id="report-escalation-reason"
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              onBlur={() => { if ((row.escalation_level ?? 'none') !== 'none') void onWorkflow({ escalationReason }); }}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="report-tags" className="mb-1">Internal tags</Label>
            <div className="flex gap-2">
              <TextInput
                id="report-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="payment, urgent, pdf"
                className="flex-1"
              />
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => void onWorkflow({ internalTags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) })}
              >
                Save tags
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle hint="Only the team sees these. They are saved when you set a status below (pick the current status to save notes without changing it).">
          Admin notes
        </SectionTitle>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Internal notes for the team…"
          aria-label="Admin notes"
        />
      </section>

      <section>
        <SectionTitle>Reporter and report</SectionTitle>
        <FactGrid
          items={[
            ['Reporter name', row.reporter_name_snapshot || '(no name)'],
            ['Reporter email', row.reporter_email_snapshot || '—'],
            ['Contact info (from user)', row.contact_info || '—'],
            ['Reporter ID', mono(row.reporter_id || '—')],
            ['Plan', plan],
            ['AI this month', aiMonth],
            ['AI today', aiToday],
            ['Reported user handle', row.target_user_handle || '—'],
            ['Platform', row.platform || '—'],
            ['App version', row.app_version || '—'],
            ['Report ID', mono(row.id)],
            ['First response', responseDuration(row.created_at, row.first_admin_response_at)],
            ['Last user reply', formatDateTime(row.last_user_reply_at)],
            ['Reopened', String(row.reopened_count ?? 0)],
          ]}
        />
      </section>
    </SidePanel>
  );
}
