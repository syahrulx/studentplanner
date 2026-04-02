import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';
import { Button } from '../ui/Button';
import { cn } from '../ui/cn';
import { IconBell, IconChevronDown, IconSearch } from '../ui/icons';

export function Topbar({
  onOpenMobileNav,
  theme,
  setTheme,
}: {
  onOpenMobileNav: () => void;
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
}) {
  const { user, admin, loading, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  const initials = useMemo(() => {
    const email = admin?.email || user?.email || '';
    const s = email.split('@')[0] || 'A';
    return s.slice(0, 2).toUpperCase();
  }, [admin?.email, user?.email]);

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur px-4 py-3 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm transition hover:bg-slate-50 md:hidden dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            aria-label="Open navigation"
          >
            ☰
          </button>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center px-2 md:justify-start">
          <div className="relative w-full max-w-xl">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              placeholder="Search users, universities, logs…"
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white/70 pl-9 pr-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label="Notifications"
          >
            <IconBell className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="hidden h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 md:inline-flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {theme === 'dark' ? 'Dark' : 'Light'}
          </button>

          {loading ? (
            <div className="h-10 w-24 rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold leading-10 text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              …
            </div>
          ) : user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50',
                  'dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
                )}
                aria-label="Profile menu"
              >
                <div className="grid h-7 w-7 place-items-center rounded-xl bg-slate-900 text-xs font-black text-white dark:bg-white dark:text-slate-950">
                  {initials}
                </div>
                <div className="hidden text-left md:block">
                  <div className="max-w-[160px] truncate text-xs font-bold">{admin?.email ?? user.email ?? '—'}</div>
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{admin?.role ?? '—'}</div>
                </div>
                <IconChevronDown className="h-4 w-4 text-slate-400" />
              </button>

              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-elev2 dark:border-slate-800 dark:bg-slate-900">
                  <div className="px-3 py-2">
                    <div className="text-xs font-black text-slate-900 dark:text-slate-100">Signed in</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {user.email}
                    </div>
                  </div>
                  <div className="h-px bg-slate-200 dark:bg-slate-800" />
                  <div className="p-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        toggleTheme();
                        setMenuOpen(false);
                      }}
                    >
                      Theme <span className="text-slate-500 dark:text-slate-400">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={async () => {
                        setMenuOpen(false);
                        await logout();
                      }}
                    >
                      Logout
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <Link to="/login">
              <Button>Sign in</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

