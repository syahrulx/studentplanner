import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../ui/cn';

/**
 * Small red-outline button for "Delete" on list cards. The kit's Button has
 * only a solid danger style, which is too loud repeated on every card, and
 * cn() does not merge Tailwind classes, so its colours cannot be overridden.
 */
export function OutlineDangerButton({
  className,
  type = 'button',
  size = 'sm',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'xs' | 'sm' }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 border border-rose-200 bg-white font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:pointer-events-none disabled:opacity-60 dark:border-rose-900/60 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/40',
        size === 'xs' ? 'h-7 rounded-lg px-2 text-xs' : 'h-9 rounded-2xl px-3 text-sm',
        className,
      )}
      {...props}
    />
  );
}
