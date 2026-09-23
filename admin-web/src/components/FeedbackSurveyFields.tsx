import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{children}</h3>
      {sub && <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}
