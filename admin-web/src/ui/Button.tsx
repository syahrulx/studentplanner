import React from 'react';
import { cn } from './cn';

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition active:translate-y-[0.5px] disabled:pointer-events-none disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60';
  const sizes =
    size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4 text-sm';
  const variants =
    variant === 'primary'
      ? 'bg-brand-600 text-white shadow-elev1 hover:bg-brand-700'
      : variant === 'secondary'
        ? 'border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
        : variant === 'danger'
          ? 'bg-rose-600 text-white shadow-elev1 hover:bg-rose-700'
          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800';

  return <button className={cn(base, sizes, variants, className)} {...props} />;
}

