import { cn } from '../../ui/cn';

export type UserActionVariant = 'neutral' | 'amber' | 'rose' | 'danger';

export type UserActionItem = {
  label: string;
  /** Items with the same group sit together; a new group starts a new section. */
  group: string;
  onClick: () => void | Promise<void>;
  variant?: UserActionVariant;
};

function buttonCls(variant: UserActionVariant | undefined): string {
  return variant === 'danger'
    ? 'bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500'
    : variant === 'rose'
      ? 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/70'
      : variant === 'amber'
        ? 'border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70'
        : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';
}

/** The same actions as the row menu, laid out as labelled button groups inside the detail panel. */
export function UserActionGroups({ items }: { items: UserActionItem[] }) {
  const groups: { name: string; items: UserActionItem[] }[] = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === it.group) last.items.push(it);
    else groups.push({ name: it.group, items: [it] });
  }
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="w-24 shrink-0 text-[10px] font-black uppercase tracking-wide text-slate-400">{g.name}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => void it.onClick()}
                className={cn('inline-flex h-8 items-center rounded-xl px-3 text-xs font-black transition', buttonCls(it.variant))}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
