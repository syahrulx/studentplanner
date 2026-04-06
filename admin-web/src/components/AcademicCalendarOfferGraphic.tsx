import type { AdminCalendarOfferRow } from '../lib/api';

type PeriodSeg = {
  type: string;
  label: string;
  startDate: string;
  endDate: string;
};

function atNoon(iso: string): number {
  const d = String(iso ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  return new Date(`${d}T12:00:00`).getTime();
}

/** Left % and width % of [segStart, segEnd] inside [rangeStart, rangeEnd] (inclusive days). */
function segmentPercent(
  segStart: string,
  segEnd: string,
  rangeStart: string,
  rangeEnd: string,
): { left: number; width: number } | null {
  const rs = atNoon(rangeStart);
  const re = atNoon(rangeEnd);
  const ss = atNoon(segStart);
  const se = atNoon(segEnd);
  if ([rs, re, ss, se].some((x) => Number.isNaN(x))) return null;
  const span = re - rs;
  if (span <= 0) return null;
  const clipStart = Math.max(ss, rs);
  const clipEnd = Math.min(se, re);
  if (clipEnd < clipStart) return null;
  const left = ((clipStart - rs) / span) * 100;
  const width = ((clipEnd - clipStart) / span) * 100;
  return { left, width: Math.max(width, 0.35) };
}

function parsePeriods(raw: unknown): PeriodSeg[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodSeg[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    const startDate = String(o.startDate ?? '').slice(0, 10);
    const endDate = String(o.endDate ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue;
    out.push({
      type: String(o.type ?? 'other'),
      label: String(o.label ?? '').trim() || String(o.type ?? 'Period'),
      startDate,
      endDate,
    });
  }
  return out;
}

function periodColor(type: string): string {
  const t = type.toLowerCase();
  if (t === 'lecture') return 'bg-emerald-500';
  if (t === 'registration') return 'bg-violet-500';
  if (t === 'exam' || t === 'test' || t === 'revision') return 'bg-rose-500';
  if (t === 'break' || t === 'special_break') return 'bg-sky-400';
  return 'bg-slate-400';
}

type Props = {
  offer: AdminCalendarOfferRow;
  universityName: string;
};

export function AcademicCalendarOfferGraphic({ offer, universityName }: Props) {
  const periods = parsePeriods(offer.periods_json);
  const hasPeriods = periods.length > 0;

  const breakPct =
    offer.break_start_date && offer.break_end_date
      ? segmentPercent(offer.break_start_date, offer.break_end_date, offer.start_date, offer.end_date)
      : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-slate-700 dark:from-slate-900 dark:to-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/15 px-3 py-1 text-xs font-black uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
            {universityName}
          </div>
          <div className="mt-2 text-sm font-black text-slate-900 dark:text-slate-100">{offer.semester_label}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {offer.start_date} → {offer.end_date} · {offer.total_weeks} teaching weeks
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
          <span>Semester timeline</span>
          <span>{hasPeriods ? `${periods.length} phases` : 'Span only'}</span>
        </div>
        <div className="relative h-16 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 dark:border-slate-600 dark:bg-slate-800/80">
          {/* Full semester track */}
          <div
            className="absolute inset-y-3 left-2 right-2 rounded-lg bg-white/90 shadow-inner dark:bg-slate-900/60"
            title={`${offer.start_date} — ${offer.end_date}`}
          />
          {breakPct ? (
            <div
              className="pointer-events-none absolute inset-y-3 z-[1] rounded-md border border-amber-400/50 bg-amber-300/35 dark:bg-amber-500/25"
              style={{ left: `calc(0.5rem + (100% - 1rem) * ${breakPct.left / 100})`, width: `calc((100% - 1rem) * ${breakPct.width / 100})` }}
              title={`Break: ${offer.break_start_date} — ${offer.break_end_date}`}
            />
          ) : null}
          {hasPeriods ? (
            <div className="absolute inset-y-3 left-2 right-2">
              {periods.map((p, i) => {
                const g = segmentPercent(p.startDate, p.endDate, offer.start_date, offer.end_date);
                if (!g) return null;
                return (
                  <div
                    key={`${p.startDate}-${p.endDate}-${i}`}
                    className={`absolute top-0.5 bottom-0.5 rounded-md opacity-95 shadow-sm ring-1 ring-black/10 dark:ring-white/10 ${periodColor(p.type)}`}
                    style={{
                      left: `${g.left}%`,
                      width: `${g.width}%`,
                      minWidth: 4,
                    }}
                    title={`${p.label} (${p.type}) · ${p.startDate} — ${p.endDate}`}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className="absolute inset-y-4 left-3 right-3 rounded-md bg-gradient-to-r from-brand-500/80 to-brand-600/90"
              title="No period breakdown — semester range only"
            />
          )}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
          <span>{offer.start_date}</span>
          <span>{offer.end_date}</span>
        </div>
      </div>

      {hasPeriods ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[10px] font-bold dark:border-slate-800">
          <span className="text-slate-500">Legend:</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Lecture
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-violet-500" /> Registration
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-500" /> Exam / test
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-400" /> Break
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-slate-400" /> Other
          </span>
        </div>
      ) : null}
    </div>
  );
}
