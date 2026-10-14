import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { authorAlias, friendlyAlias } from '../../lib/confessionAliases';
import type { AdminConfession, AdminConfessionComment } from '../../lib/api';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/Input';
import { cn } from '../../ui/cn';
import { Chip, SidePanel, SkeletonRows } from '../../ui/page';
import { campusLabel, when } from './confessionFormat';

export type ConfessionCounts = { live: number; review: number; reported: number; removed: number };

/** Four small numbers on a university or campus card. */
function CountRow({ counts }: { counts: ConfessionCounts }) {
  const items: { label: string; value: number; tone: string }[] = [
    { label: 'Live', value: counts.live, tone: 'text-slate-900 dark:text-slate-100' },
    {
      label: 'Needs review',
      value: counts.review,
      tone: counts.review > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600',
    },
    {
      label: 'Reported',
      value: counts.reported,
      tone: counts.reported > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-300 dark:text-slate-600',
    },
    { label: 'Removed', value: counts.removed, tone: 'text-slate-400 dark:text-slate-500' },
  ];
  return (
    <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dd className={cn('text-lg font-black leading-none tabular-nums', i.tone)}>{i.value}</dd>
          <dt className="mt-1 truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{i.label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** A university or campus you can open. Amber edge = something waits for review. */
export function DrillCard({ title, subtitle, counts, onClick, uppercase }: {
  title: string;
  subtitle: string;
  counts: ConfessionCounts;
  onClick: () => void;
  uppercase?: boolean;
}) {
  const waiting = counts.review > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative overflow-hidden rounded-3xl border bg-white p-5 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-elev1 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:bg-slate-900',
        waiting ? 'border-amber-200 dark:border-amber-900/60' : 'border-slate-200 dark:border-slate-800',
      )}
    >
      {waiting && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber-400 dark:bg-amber-500" />}
      <div className={cn('truncate text-lg font-black tracking-tight text-slate-900 dark:text-slate-100', uppercase && 'uppercase')}>
        {title}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-slate-400 dark:text-slate-500">{subtitle}</div>
      <CountRow counts={counts} />
    </button>
  );
}

export function SuspectChips({ terms, reviewed }: { terms: string[]; reviewed?: boolean }) {
  if (!terms?.length) return null;
  // The evidence survives the decision: a cleared flag still shows what was
  // matched, in grey, so the call can be revisited.
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <Chip tone={reviewed ? 'neutral' : 'warning'}>{reviewed ? 'Marked safe' : 'Looks like'}</Chip>
      {terms.map((t) => (
        <span
          key={t}
          className={cn(
            'rounded-lg border px-2 py-0.5 font-mono text-[11px] font-bold',
            reviewed
              ? 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
              : 'border-amber-200 text-amber-700 dark:border-amber-900/60 dark:text-amber-300',
          )}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: AdminConfession['status'] }) {
  if (status === 'active') return <Chip tone="success">Live</Chip>;
  if (status === 'flagged') return <Chip tone="warning">Flagged</Chip>;
  return <Chip tone="neutral">Removed</Chip>;
}

/** Where a post came from and who posted it, as students see it. */
function PostMeta({ row }: { row: AdminConfession }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-bold text-slate-400 dark:text-slate-500">
      {/* The name students see on this post. A thread reported as "Kancil
          Hijau said X" is unreadable here without it. */}
      <span className="text-slate-600 dark:text-slate-300">{authorAlias(row.id)}</span>
      <span aria-hidden>·</span>
      <span className="font-mono">#{row.confession_no ?? '—'}</span>
      <span aria-hidden>·</span>
      {/* Where it came from. A search runs across every university, so a row
          on its own said nothing about which campus was being moderated. */}
      <span className="uppercase">{row.university_id}</span>
      <span aria-hidden>·</span>
      <span>{campusLabel(row.campus)}</span>
      <span aria-hidden>·</span>
      <span>{when(row.created_at)}</span>
    </div>
  );
}

const ACTION_BASE =
  'inline-flex h-9 items-center justify-center rounded-2xl border px-3 text-sm font-semibold shadow-sm transition disabled:pointer-events-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60';
const ACTION_PLAIN =
  'border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

/** Mark safe / Flag again, and Remove / Restore, for one post. */
export function ConfessionActions({ row, busy, onToggleSafe, onRestore, onRemove }: {
  row: AdminConfession;
  busy: boolean;
  onToggleSafe: () => void;
  onRestore: () => void;
  onRemove: () => void;
}) {
  return (
    <>
      {row.suspect_terms.length > 0 && row.status !== 'removed' && (
        <button
          type="button"
          disabled={busy}
          onClick={onToggleSafe}
          className={cn(
            ACTION_BASE,
            row.suspect_reviewed_at
              ? ACTION_PLAIN
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40',
          )}
        >
          {row.suspect_reviewed_at ? 'Flag again' : 'Mark safe'}
        </button>
      )}
      {row.status === 'removed' ? (
        <button type="button" disabled={busy} onClick={onRestore} className={cn(ACTION_BASE, ACTION_PLAIN)}>
          Restore
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={onRemove}
          className={cn(
            ACTION_BASE,
            'border-slate-200 bg-white text-slate-900 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-rose-900/60 dark:hover:bg-rose-950/40 dark:hover:text-rose-300',
          )}
        >
          Remove
        </button>
      )}
    </>
  );
}

export function ConfessionCard({ row, onOpenReplies, actions }: {
  row: AdminConfession;
  onOpenReplies: () => void;
  actions: ReactNode;
}) {
  const waiting = row.suspect_terms.length > 0 && !row.suspect_reviewed_at && row.status !== 'removed';
  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-3xl border bg-white p-5 shadow-soft dark:bg-slate-900',
        waiting ? 'border-amber-200 dark:border-amber-900/60' : 'border-slate-200 dark:border-slate-800',
      )}
    >
      {waiting && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber-400 dark:bg-amber-500" />}
      <div className="flex items-start justify-between gap-3">
        <PostMeta row={row} />
        <div className="flex shrink-0 items-center gap-1.5">
          {row.tag && <Chip>{row.tag}</Chip>}
          <StatusChip status={row.status} />
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
        {row.content}
      </p>

      <SuspectChips terms={row.suspect_terms} reviewed={!!row.suspect_reviewed_at} />

      {row.removed_reason && (
        <div className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">Removed: {row.removed_reason}</div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-xs font-bold text-slate-400 dark:border-slate-800 dark:text-slate-500">
        <span>{row.like_count} like{row.like_count === 1 ? '' : 's'}</span>
        <button
          type="button"
          onClick={onOpenReplies}
          className="rounded-lg px-1.5 py-1 text-slate-600 underline-offset-2 transition hover:bg-slate-100 hover:underline dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {row.comment_count} repl{row.comment_count === 1 ? 'y' : 'ies'}
        </button>
        {row.report_count > 0 && <Chip tone="warning">{row.report_count} reported</Chip>}
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      </div>
    </article>
  );
}

/** One post with its replies, opened from the post card. */
export function ConfessionThreadPanel({ row, replies, loading, busy, onClose, onCommentStatus, actions }: {
  row: AdminConfession;
  replies: AdminConfessionComment[];
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onCommentStatus: (id: string, status: AdminConfessionComment['status']) => void;
  actions: ReactNode;
}) {
  return (
    <SidePanel
      title={`Confession #${row.confession_no ?? '—'}`}
      subtitle={`${authorAlias(row.id)} · ${row.university_id.toUpperCase()} · ${campusLabel(row.campus)} · ${when(row.created_at)}`}
      chips={<>
        <StatusChip status={row.status} />
        {row.tag && <Chip>{row.tag}</Chip>}
        {row.report_count > 0 && <Chip tone="warning">{row.report_count} reported</Chip>}
      </>}
      onClose={onClose}
      footer={actions}
    >
      <div>
        <p className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
          {row.content}
        </p>
        <SuspectChips terms={row.suspect_terms} reviewed={!!row.suspect_reviewed_at} />
        {row.removed_reason && (
          <div className="mt-2 text-xs font-semibold text-slate-400 dark:text-slate-500">Removed: {row.removed_reason}</div>
        )}
        <div className="mt-2 text-xs font-bold text-slate-400 dark:text-slate-500">
          {row.like_count} like{row.like_count === 1 ? '' : 's'}
        </div>
      </div>

      <section>
        <h3 className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-400">
          Replies · {row.comment_count}
        </h3>
        {loading ? (
          <SkeletonRows rows={2} height="h-16" />
        ) : replies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-center text-xs font-semibold text-slate-400 dark:border-slate-700">
            No replies.
          </div>
        ) : (
          <ul className="space-y-2">
            {replies.map((r) => (
              <li key={r.id} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/60">
                <div className="flex items-start justify-between gap-3">
                  <p className={cn(
                    'whitespace-pre-wrap break-words text-sm font-semibold',
                    r.status === 'removed' ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-300',
                  )}>
                    {r.content}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCommentStatus(r.id, r.status === 'removed' ? 'active' : 'removed')}
                    className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 transition hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-300"
                  >
                    {r.status === 'removed' ? 'Restore' : 'Remove'}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                  <span className="text-slate-600 dark:text-slate-300">{friendlyAlias(r.alias, row.id)}</span>
                  <span aria-hidden>·</span>
                  <span>{when(r.created_at)}</span>
                </div>
                <SuspectChips terms={r.suspect_terms} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </SidePanel>
  );
}

/**
 * "Remove this confession?" confirm. Drawn into document.body above any side
 * panel, so it opens in view even when started from the replies panel.
 */
export function RemoveConfessionDialog({ row, reason, onReasonChange, busy, onCancel, onConfirm }: {
  row: AdminConfession;
  reason: string;
  onReasonChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/60 p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-confession-title"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-elev1 dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="remove-confession-title" className="text-lg font-black text-slate-900 dark:text-slate-100">Remove this confession?</div>
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          It leaves the student feed immediately. The row is kept so the campus numbering stays
          correct, and you can restore it from the Removed filter.
        </p>
        <div className="mt-3 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          {row.content}
        </div>
        <TextInput
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Reason (optional)"
          aria-label="Reason (optional)"
          className="mt-3"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" size="sm" disabled={busy} onClick={onConfirm}>Remove</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
