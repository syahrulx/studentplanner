import type { ReactNode } from 'react';
import type { AdminServiceReportRow, AdminServiceRow } from '../../lib/api';
import { Button } from '../../ui/Button';
import { Chip, EmptyState, FactGrid, Notice, SidePanel, SkeletonRows } from '../../ui/page';
import { KIND_TONE, STATUS_TONE, capitalize, fmt, fmtPrice, isActive, type ServiceAction } from './serviceFormat';

/** A person's name with their user id underneath (small, for support lookups). */
function WithId({ name, id }: { name: string | null | undefined; id: string | null | undefined }) {
  return (
    <>
      {name || '—'}
      {id ? <span className="block truncate font-mono text-[11px] font-normal text-slate-400 dark:text-slate-500">{id}</span> : null}
    </>
  );
}

/** Right-side panel with the full service, its reports and the admin actions. */
export function ServiceDetailPanel({
  service: s,
  reports,
  loadingReports,
  onClose,
  onAction,
}: {
  service: AdminServiceRow;
  reports: AdminServiceReportRow[];
  loadingReports: boolean;
  onClose: () => void;
  onAction: (action: ServiceAction, id: string) => void;
}) {
  const active = isActive(s);

  const facts: [ReactNode, ReactNode][] = [
    ['Price', fmtPrice(s)],
    ['Deadline', s.deadline_at ? fmt(s.deadline_at) : '—'],
    ['Author', <WithId name={s.author_name} id={s.author_id} />],
    ['Taker', <WithId name={s.claimer_name} id={s.claimed_by} />],
    ['Revisions', `${s.revision_count} / ${s.max_revisions}`],
    ['Offers', s.offer_count ?? 0],
    ['University', s.university_name || s.university_id || '—'],
    ['Campus', s.campus || '—'],
    ['Location', s.location || '—'],
  ];

  return (
    <SidePanel
      title={s.title}
      subtitle={`Posted ${fmt(s.created_at)}`}
      chips={
        <>
          <Chip tone={KIND_TONE[s.service_kind] ?? 'neutral'}>{capitalize(s.service_kind)}</Chip>
          <Chip tone={STATUS_TONE[s.service_status] ?? 'neutral'}>{capitalize(s.service_status)}</Chip>
          {s.service_category && <Chip>{capitalize(s.service_category)}</Chip>}
          {s.cancel_requested_by && <Chip tone="danger">Cancel requested</Chip>}
        </>
      }
      onClose={onClose}
      footer={
        <>
          {active && (
            <>
              <Button size="sm" variant="secondary" onClick={() => onAction('complete', s.id)}>
                Force complete
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onAction('reopen', s.id)}>
                Force reopen
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onAction('cancel', s.id)}>
                Force cancel
              </Button>
            </>
          )}
          <Button size="sm" variant="danger" onClick={() => onAction('delete', s.id)}>
            Delete service
          </Button>
        </>
      }
    >
      {s.body ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{s.body}</p>
      ) : (
        <p className="text-sm italic text-slate-400 dark:text-slate-500">No description.</p>
      )}

      <FactGrid items={facts} />

      {s.delivery_note && (
        <Notice tone="info" title="Delivery note">
          <span className="whitespace-pre-wrap font-normal">{s.delivery_note}</span>
        </Notice>
      )}

      {/* Reports */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            Reports ({loadingReports ? '…' : reports.length})
          </h3>
          {reports.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => onAction('clearReports', s.id)}>
              Clear reports
            </Button>
          )}
        </div>
        {loadingReports ? (
          <SkeletonRows rows={2} height="h-12" />
        ) : reports.length === 0 ? (
          <EmptyState title="No one has reported this service." />
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Each one is from a student. If a report is right, delete the service below.
            </p>
            <ul className="divide-y divide-rose-100 rounded-2xl border border-rose-200 bg-rose-50/60 dark:divide-rose-900/40 dark:border-rose-900/50 dark:bg-rose-950/30">
              {reports.map((r) => (
                <li key={r.id} className="px-4 py-2.5">
                  <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">{r.reason}</div>
                  <div className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">by {r.reporter_name} · {fmt(r.created_at)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <div className="break-all font-mono text-xs text-slate-400 dark:text-slate-500">ID: {s.id}</div>
    </SidePanel>
  );
}
