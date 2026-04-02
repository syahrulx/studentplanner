import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';

type LoginLocationState = {
  from?: string;
  denied?: boolean;
  deniedReason?: 'not_registered' | 'disabled';
};

export function LoginRoute() {
  const { user, admin, loading, logout, refreshAdmin } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const state = (loc.state || {}) as LoginLocationState;
  const from = useMemo(() => String(state.from || '/dashboard'), [state.from]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [continueErr, setContinueErr] = useState<string>('');

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Checking access…
        </div>
      </div>
    );
  }

  if (user && admin && !admin.disabled) return <Navigate to={from} replace />;

  const blocked = Boolean(user && (!admin || admin.disabled));
  const sqlForEmail = user?.email
    ? `-- Run in Supabase → SQL Editor (same project as VITE_SUPABASE_URL)
insert into public.admin_users (user_id, email, role)
select id, email, 'super_admin'
from auth.users
where email = '${user.email.replace(/'/g, "''")}'
on conflict (user_id) do update
  set email = excluded.email,
      role = excluded.role,
      disabled = false;`
    : '';

  if (blocked) {
    const reason = admin?.disabled ? 'disabled' : state.deniedReason;
    return (
      <div className="min-h-dvh bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <div className="mx-auto max-w-lg">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
              GradeUp <span className="text-brand-600 dark:text-brand-400">Admin</span>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              {admin?.disabled || reason === 'disabled' ? (
                <>
                  Admin access for <span className="font-black">{user?.email}</span> is turned off (
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">disabled = true</code> in{' '}
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">admin_users</code>). Ask a super admin to set{' '}
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">disabled</code> to false, or use another account.
                </>
              ) : (
                <>
                  You are signed in as <span className="font-black">{user?.email}</span>, but that user is not registered in{' '}
                  <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/50">public.admin_users</code>. Auth login worked; the
                  dashboard only allows users listed there.
                </>
              )}
            </div>

            {!admin?.disabled && sqlForEmail ? (
              <div className="mt-4">
                <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Fix (one time)</div>
                <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  In the Supabase project that matches your <code className="text-slate-800 dark:text-slate-200">.env</code> URL, open{' '}
                  <span className="font-black">SQL Editor</span> and run:
                </p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  {sqlForEmail}
                </pre>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Then click <span className="font-black text-slate-700 dark:text-slate-200">Continue</span> below (or sign in again).
                </p>
              </div>
            ) : null}

            {continueErr ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {continueErr}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setContinueErr('');
                  try {
                    await logout();
                    nav('/login', { replace: true, state: {} });
                  } finally {
                    setBusy(false);
                  }
                }}
                className="h-11 flex-1 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                Sign out
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setContinueErr('');
                  try {
                    await refreshAdmin();
                    nav(from, { replace: true });
                  } catch {
                    setContinueErr(
                      'Still not authorized. Run the SQL in the same Supabase project as VITE_SUPABASE_URL, and use the exact auth email for this account.',
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="h-11 flex-1 rounded-2xl bg-brand-600 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
              >
                I added the row — continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            GradeUp <span className="text-brand-600 dark:text-brand-400">Admin</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">Sign in to continue</div>

          {state.denied ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
              This account is not authorized for admin access.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {error}
            </div>
          ) : null}

          <form
            className="mt-6 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const { error } = await supabase.auth.signInWithPassword({
                  email: email.trim(),
                  password,
                });
                if (error) throw error;
                nav(from, { replace: true });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Login failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="block">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Email</div>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                autoComplete="email"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <label className="block">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Password</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                autoComplete="current-password"
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 h-11 w-full rounded-2xl bg-brand-600 text-sm font-black text-white shadow-soft transition hover:bg-brand-700 disabled:opacity-70"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-5 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Admin access is controlled via Supabase RLS + <code className="text-slate-600 dark:text-slate-300">admin_users</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
