import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../state/AuthProvider';

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const bypass = (import.meta as any).env?.VITE_BYPASS_ADMIN_AUTH === 'true';
  const { user, admin, loading } = useAuth();
  const loc = useLocation();

  if (bypass) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-dvh grid place-items-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="text-sm font-semibold">Loading admin…</div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (admin?.disabled) {
    return <Navigate to="/login" replace state={{ from: loc.pathname, denied: true, deniedReason: 'disabled' as const }} />;
  }
  if (!admin) {
    return <Navigate to="/login" replace state={{ from: loc.pathname, denied: true, deniedReason: 'not_registered' as const }} />;
  }

  return <>{children}</>;
}

