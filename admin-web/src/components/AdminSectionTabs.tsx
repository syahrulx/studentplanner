import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EmbeddedPage, PageHeader } from '../ui/page';

export type AdminSectionTab = {
  id: string;
  label: string;
  description: string;
  content: ReactNode;
};

/**
 * A small shared shell for related admin tools. It deliberately keeps every
 * existing route component intact: grouping sections must not alter or migrate
 * any underlying data.
 */
export function AdminSectionTabs({ title, description, tabs }: {
  title: string;
  description: string;
  tabs: AdminSectionTab[];
}) {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') || tabs[0]?.id;
  const active = tabs.find((tab) => tab.id === requested) ?? tabs[0];

  if (!active) return null;

  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === tabs[0]?.id) next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description} />
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-soft dark:border-slate-800 dark:bg-slate-900" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === active.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.description}
              onClick={() => choose(tab.id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black transition ${
                selected
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active.description ? <p className="-mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{active.description}</p> : null}
      {/* Pages inside a tab drop their own big title (said once, above). */}
      <EmbeddedPage>{active.content}</EmbeddedPage>
    </div>
  );
}
