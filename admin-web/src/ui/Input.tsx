import React from 'react';
import { cn } from './cn';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300', className)} {...props} />;
}

export function TextInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
        'dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
        'dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-900 outline-none transition',
        'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15',
        'dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  );
}

