import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AdminServiceReportRow, AdminServiceRow } from '../../lib/api';
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

function Fact({ label, children, sub }: { label: string; children: ReactNode; sub?: string | null }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 break-words text-sm font-bold text-slate-900 dark:text-slate-100">{children}</div>
      {sub && <div className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}

/**
 * Right-side panel with the full service, its reports and the admin actions.
 * Drawn into document.body: the admin layout animates with transforms,
 * which trapped a fixed overlay inside the page (you had to scroll to it).
 */
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

  return createPortal(
    <div className="fixed inset-0 z-[150] flex justify-end">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={s.title}
        className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${KIND_COLORS[s.service_kind] || ''}`}>{s.service_kind}</span>
                <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${STATUS_COLORS[s.service_status] || ''}`}>{s.service_status}</span>
                {s.service_category && <span className={META_CHIP}>{capitalize(s.service_category)}</span>}
                {s.cancel_requested_by && (
                  <span className="rounded-xl bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                    ⚠️ Cancel requested
                  </span>
                )}
              </div>
              <h2 className="mt-2 break-words text-xl font-black text-slate-900 dark:text-slate-100">{s.title}</h2>
              <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Posted {fmt(s.created_at)}</div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-lg font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-5 py-5 sm:px-6">
          {/* Body */}
          {s.body ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">{s.body}</p>
          ) : (
            <p className="text-sm italic text-slate-400 dark:text-slate-500">No description.</p>
          )}

          {/* About */}
          <section>
            <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">About</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact label="Price">{fmtPrice(s)}</Fact>
              <Fact label="Deadline">{s.deadline_at ? fmt(s.deadline_at) : '—'}</Fact>
              <Fact label="Author" sub={s.author_id}>{s.author_name || '—'}</Fact>
              <Fact label="Taker" sub={s.claimed_by}>{s.claimer_name || '—'}</Fact>
              <Fact label="Revisions">{s.revision_count} / {s.max_revisions}</Fact>
              <Fact label="Offers">{s.offer_count ?? 0}</Fact>
              <Fact label="University">{s.university_name || s.university_id || '—'}</Fact>
              <Fact label="Campus">{s.campus || '—'}</Fact>
              <div className="sm:col-span-2">
                <Fact label="Location">{s.location || '—'}</Fact>
              </div>
            </div>
          </section>

          {/* Delivery note */}
          {s.delivery_note && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/30">
              <div className="text-xs font-black uppercase tracking-wide text-blue-600 dark:text-blue-300">Delivery note</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-blue-900 dark:text-blue-100">{s.delivery_note}</div>
            </section>
          )}

          {/* Reports */}
          <section>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Reports ({loadingReports ? '…' : reports.length})
              </div>
              {reports.length > 0 && (
                <button
                  onClick={() => onAction('clearReports', s.id)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  🧹 Clear reports
                </button>
              )}
            </div>
            {loadingReports ? (
              <div className="mt-2 text-sm text-slate-400 dark:text-slate-500">Loading…</div>
            ) : reports.length === 0 ? (
              <div className="mt-2 rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                No one has reported this service.
              </div>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Each one is from a student. If a report is right, delete the service below.
                </p>
                <ul className="mt-2 space-y-2">
                  {reports.map((r) => (
                    <li key={r.id} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900/40 dark:bg-rose-950/30">
                      <div className="text-sm font-semibold text-rose-900 dark:text-rose-100">{r.reason}</div>
                      <div className="mt-0.5 text-xs text-rose-600 dark:text-rose-300">by {r.reporter_name} · {fmt(r.created_at)}</div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <div className="break-all font-mono text-xs text-slate-400 dark:text-slate-500">ID: {s.id}</div>
        </div>

        {/* Admin actions */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin actions</div>
          <div className="flex flex-wrap gap-2">
            {active && (
              <>
                <button
                  onClick={() => onAction('complete', s.id)}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-black text-sky-800 hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70"
                >
                  ✅ Force complete
                </button>
                <button
                  onClick={() => onAction('reopen', s.id)}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-black text-amber-800 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
                >
                  🔓 Force reopen
                </button>
                <button
                  onClick={() => onAction('cancel', s.id)}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-800 hover:bg-rose-100 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70"
                >
                  ❌ Force cancel
                </button>
              </>
            )}
            <button
              onClick={() => onAction('delete', s.id)}
              className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 sm:ml-auto"
            >
              🗑️ Delete service
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
