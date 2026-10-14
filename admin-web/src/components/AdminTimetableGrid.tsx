import { useMemo } from 'react';
import type { TimetableEntryRow } from '../lib/api';
import {
  WEEK_DAYS_MON_FIRST,
  entriesToGridSlots,
  minutesToHHMM,
  parseTimeToMinutes,
  type WeekDayLabel,
} from '../lib/timetableGridUtils';

function formatSlotRange(start: string, end: string): string {
  const sm = parseTimeToMinutes(start);
  const em = parseTimeToMinutes(end);
  if (sm == null || em == null) return `${start}–${end}`;
  return `${minutesToHHMM(sm)}–${minutesToHHMM(em)}`;
}

const START_HOUR = 7;
const END_HOUR = 22;
const HOUR_HEIGHT_PX = 48;
const TIME_GUTTER_W = 44;

const gridBodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT_PX;

function minutesFromGridStart(m: number): number {
  return m - START_HOUR * 60;
}

type Props = {
  entries: TimetableEntryRow[];
  onSlotClick: (row: TimetableEntryRow) => void;
  minColumnWidth?: number;
};

export function AdminTimetableGrid({ entries, onSlotClick, minColumnWidth = 96 }: Props) {
  const slotsByDay = useMemo(() => {
    const slots = entriesToGridSlots(entries);
    const map = new Map<WeekDayLabel, typeof slots>();
    for (const d of WEEK_DAYS_MON_FIRST) map.set(d, []);
    for (const s of slots) {
      map.get(s.day)?.push(s);
    }
    // Shorter slots render last (higher in DOM) so they stack above longer overlaps and stay clickable.
    for (const d of WEEK_DAYS_MON_FIRST) {
      const list = map.get(d);
      if (!list) continue;
      list.sort((a, b) => {
        const da = a.endMin - a.startMin;
        const db = b.endMin - b.startMin;
        if (da !== db) return da - db;
        return a.startMin - b.startMin;
      });
    }
    return map;
  }, [entries]);

  const hours = useMemo(() => {
    const h: number[] = [];
    for (let x = START_HOUR; x <= END_HOUR; x++) h.push(x);
    return h;
  }, []);

  const daysMinWidth = WEEK_DAYS_MON_FIRST.length * minColumnWidth;

  return (
    // One scroll area for the hour labels and the days, so they always line up.
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-950/50">
      <div className="flex" style={{ minWidth: daysMinWidth + TIME_GUTTER_W }}>
        <div
          className="shrink-0 border-r border-slate-200 text-right text-[10px] font-bold tabular-nums text-slate-400 dark:border-slate-700 dark:text-slate-500"
          style={{ width: TIME_GUTTER_W }}
        >
          <div className="h-9 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900" aria-hidden="true" />
          {hours.slice(0, -1).map((hr) => (
            <div
              key={hr}
              className="box-border pr-1.5 pt-0.5 leading-none"
              style={{ height: HOUR_HEIGHT_PX }}
            >
              {String(hr).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {WEEK_DAYS_MON_FIRST.map((day) => (
          <div
            key={day}
            className="relative min-w-0 flex-1 basis-0 border-r border-slate-200 last:border-r-0 dark:border-slate-700"
            style={{ minWidth: minColumnWidth }}
          >
            <div className="flex h-9 items-center justify-center border-b border-slate-200 bg-white text-[11px] font-black uppercase tracking-wide text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              {day.slice(0, 3)}
            </div>
            <div className="relative" style={{ height: gridBodyHeight }}>
              {hours.slice(0, -1).map((hr) => (
                <div
                  key={hr}
                  className="box-border border-b border-slate-100 dark:border-slate-800/80"
                  style={{ height: HOUR_HEIGHT_PX }}
                />
              ))}
              {(slotsByDay.get(day) ?? []).map((s, stackIdx) => {
                const top = (minutesFromGridStart(s.startMin) / 60) * HOUR_HEIGHT_PX;
                const h = Math.max(
                  24,
                  ((s.endMin - s.startMin) / 60) * HOUR_HEIGHT_PX - 2,
                );
                const z = 2 + stackIdx;
                const timeLabel = formatSlotRange(s.row.start_time, s.row.end_time);
                const compactSlot = h < 44;
                return (
                  <button
                    key={`${s.row.id}-${s.startMin}`}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSlotClick(s.row);
                    }}
                    className={`absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded-lg border border-white/20 text-left shadow-sm transition hover:brightness-110 hover:ring-2 hover:ring-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 active:ring-2 active:ring-brand-400 ${
                      compactSlot
                        ? 'flex items-center gap-1 px-1 py-0.5'
                        : 'flex h-full flex-col px-1.5 py-1'
                    }`}
                    style={{
                      top,
                      height: h,
                      zIndex: z,
                      backgroundColor: s.color,
                      color: '#fff',
                    }}
                    aria-label={`Edit ${s.title}, ${s.row.day} ${s.row.start_time} to ${s.row.end_time}`}
                    title={`Click to edit · ${s.row.subject_code} · ${timeLabel}`}
                  >
                    {compactSlot ? (
                      <>
                        <span className="shrink-0 whitespace-nowrap font-mono text-[9px] font-extrabold tracking-tight opacity-95">
                          {timeLabel}
                        </span>
                        <span className="min-w-0 truncate text-[10px] font-black leading-none">{s.title}</span>
                      </>
                    ) : (
                      <>
                        <div className="shrink-0 font-mono text-[10px] font-extrabold leading-none tracking-tight opacity-95">
                          {timeLabel}
                        </div>
                        <div className="mt-1 min-h-0 flex-1 text-[11px] font-black leading-snug line-clamp-6">
                          {s.title}
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
