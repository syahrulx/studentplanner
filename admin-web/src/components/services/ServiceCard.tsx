import type { AdminServiceRow } from '../../lib/api';
import {
  KIND_COLORS,
  META_CHIP,
  STATUS_COLORS,
  capitalize,
  fmt,
  fmtPrice,
  isActive,
  type ServiceAction,
} from './serviceFormat';

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
      className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
        reported
          ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300 dark:border-rose-900/50 dark:bg-rose-950/20 dark:hover:border-rose-800'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
      }`}
    >
      {reported && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-rose-500 dark:bg-rose-400" />}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <div className="line-clamp-2 min-w-0 flex-1 text-base font-black text-slate-900 dark:text-slate-100">
              {s.title}
            </div>
            {reported && (
              <span className="inline-flex shrink-0 items-center rounded-xl bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                🚩 {reportCount} report{reportCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            {s.service_category ? capitalize(s.service_category) : 'No category'}
          </div>
          {s.body && (
            <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{s.body}</p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${KIND_COLORS[s.service_kind] || ''}`}>
              {s.service_kind}
            </span>
            <span className={`inline-flex rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[s.service_status] || ''}`}>
              {s.service_status}
            </span>
            {s.cancel_requested_by && (
              <span className="inline-flex rounded-xl bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                ⚠️ Cancel requested
              </span>
            )}
            <span className={META_CHIP}>{fmtPrice(s)}</span>
            <span className={META_CHIP}>
              {s.author_name || 'Unknown'}
              {s.claimer_name && (
                <>
                  <span className="text-slate-400 dark:text-slate-500">→</span>
                  {s.claimer_name}
                </>
              )}
            </span>
            {place && <span className={META_CHIP}>📍 {place}</span>}
            <span className={`${META_CHIP} tabular-nums`}>{fmt(s.created_at)}</span>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
          {isActive(s) && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAction('cancel', s.id);
              }}
              className="rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/40"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction('delete', s.id);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function ServiceCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="h-4 w-2/3 rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="mt-2 h-3 w-24 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
      <div className="mt-3 h-3 w-full rounded-lg bg-slate-100 dark:bg-slate-800/70" />
      <div className="mt-1.5 h-3 w-4/5 rounded-lg bg-slate-100 dark:bg-slate-800/70" />
      <div className="mt-3 flex gap-1.5">
        <div className="h-6 w-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-6 w-16 rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-6 w-20 rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
