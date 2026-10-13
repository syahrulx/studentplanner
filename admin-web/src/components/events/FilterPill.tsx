/**
 * Rounded pill used as a quick filter. Shows an optional count; when `alert`
 * is set and the count is above zero, the count turns into a red badge.
 */
export function FilterPill({
  label,
  count,
  active,
  alert = false,
  onClick,
  title,
}: {
  label: string;
  count?: number | null;
  active: boolean;
  alert?: boolean;
  onClick: () => void;
  title?: string;
}) {
  const showAlert = alert && typeof count === 'number' && count > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active
          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      <span>{label}</span>
      {typeof count === 'number' ? (
        showAlert ? (
          <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-rose-500 px-1.5 text-[11px] font-black leading-5 text-white dark:bg-rose-500 dark:text-white">
            {count}
          </span>
        ) : (
          <span
            className={`text-xs font-bold tabular-nums ${
              active ? 'text-white/70 dark:text-slate-950/60' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {count}
          </span>
        )
      ) : null}
    </button>
  );
}
