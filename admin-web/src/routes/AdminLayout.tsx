import { Link, Outlet } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { RequireAdmin } from '../components/RequireAdmin';
import { Sidebar } from '../components/Sidebar';
import { Topbar } from '../components/Topbar';
import { useAuth } from '../state/AuthProvider';

const bypassAuth = import.meta.env.VITE_BYPASS_ADMIN_AUTH === 'true';
const devSecretSet = Boolean(String(import.meta.env.VITE_ADMIN_WEB_DEV_SECRET || '').trim());

function getStoredTheme(): 'light' | 'dark' {
  const v = localStorage.getItem('gradeup_admin_theme');
  return v === 'dark' ? 'dark' : 'light';
}

export function AdminLayout() {
  const { user, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => getStoredTheme());

  useEffect(() => {
    localStorage.setItem('gradeup_admin_theme', theme);
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const mobileNav = useMemo(() => {
    if (!mobileOpen) return null;
    return (
      <div className="fixed inset-0 z-20 md:hidden">
        <button
          className="absolute inset-0 bg-black/40"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
        <div className="absolute left-0 top-0 h-full">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>
    );
  }, [mobileOpen]);

  return (
    <RequireAdmin>
      <div className="min-h-dvh bg-slate-50 dark:bg-slate-950">
        {mobileNav}
        <div className="flex min-h-dvh">
          <div className="hidden md:block">
            <Sidebar />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onOpenMobileNav={() => setMobileOpen(true)} theme={theme} setTheme={setTheme} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
              {bypassAuth && !loading && !user && !devSecretSet ? (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                  <span className="font-black">No Supabase session.</span> RLS blocks direct reads until you sign in as an
                  admin, so the UI will not match the Table Editor.{' '}
                  <Link to="/login" className="font-black text-brand-700 underline underline-offset-2 dark:text-brand-400">
                    Sign in
                  </Link>
                  , or for local dev set the same value in{' '}
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">VITE_ADMIN_WEB_DEV_SECRET</code> (this
                  app) and <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">ADMIN_WEB_DEV_SECRET</code>{' '}
                  (Edge Function secret), then redeploy <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">admin_users</code>{' '}
                  and <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">admin_data</code>.
                </div>
              ) : null}
              {bypassAuth && !loading && !user && devSecretSet ? (
                <div className="mb-4 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-100">
                  <span className="font-black">Dev data mode.</span> API calls use{' '}
                  <code className="rounded bg-sky-100/80 px-1 dark:bg-sky-900/50">VITE_ADMIN_WEB_DEV_SECRET</code>. Anyone who
                  can load this app can use that key — keep it local, rotate it, and never ship it in a public build.
                </div>
              ) : null}
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </RequireAdmin>
  );
}

