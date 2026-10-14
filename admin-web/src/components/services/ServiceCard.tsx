import type { AdminServiceRow } from '../../lib/api';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/page';
import { OutlineDangerButton } from '../events/OutlineDangerButton';
import { KIND_TONE, STATUS_TONE, capitalize, fmt, fmtPrice, isActive, type ServiceAction } from './serviceFormat';

export function ServiceCard({
  service: s,
  onOpen,
  onAction,
}: {
  service: AdminServiceRow;
  onOpen: (s: AdminServiceRow) => void;
  onAction: (action: ServiceAction, id: string) => void;
}) {
  const reportCount = s.report_count ?? 0;
  const reported = reportCount > 0;
  const place = [s.campus, s.university_name].filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(s)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(s);
        }
      }}
      className={`cursor-pointer rounded-2xl border bg-white p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:bg-slate-900 ${
        reported
          ? 'border-l-4 border-rose-300 hover:border-rose-400 dark:border-rose-800 dark:hover:border-rose-700'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-base font-black leading-snug text-slate-900 dark:text-slate-100">{s.title}</div>
          <div className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            {s.service_category ? capitalize(s.service_category) : 'No category'}
          </div>
          {s.body && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{s.body}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {reported && (
              <Chip tone="danger">
                {reportCount} report{reportCount !== 1 ? 's' : ''}
              </Chip>
            )}
            <Chip tone={KIND_TONE[s.service_kind] ?? 'neutral'}>{capitalize(s.service_kind)}</Chip>
            <Chip tone={STATUS_TONE[s.service_status] ?? 'neutral'}>{capitalize(s.service_status)}</Chip>
            {s.cancel_requested_by && <Chip tone="danger">Cancel requested</Chip>}
            <Chip title="Price">{fmtPrice(s)}</Chip>
            <Chip title={s.claimer_name ? 'Author → taker' : 'Author'}>
              {s.author_name || 'Unknown'}
              {s.claimer_name && (
                <>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  {s.claimer_name}
                </>
              )}
            </Chip>
            {place && <Chip title="Place">{place}</Chip>}
            <Chip title="Posted on">
              <span className="tabular-nums">{fmt(s.created_at)}</span>
            </Chip>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {isActive(s) && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onAction('cancel', s.id);
              }}
            >
              Cancel
            </Button>
          )}
          <OutlineDangerButton
            onClick={(e) => {
              e.stopPropagation();
              onAction('delete', s.id);
            }}
          >
            Delete
          </OutlineDangerButton>
        </div>
      </div>
    </div>
  );
}
