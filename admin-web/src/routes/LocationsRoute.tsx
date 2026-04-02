import { useEffect, useMemo, useState } from 'react';
import { listPublicUserLocations, type PublicLocationRow } from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';

function mapsUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(String(lat))}&mlon=${encodeURIComponent(String(lng))}#map=16/${lat}/${lng}`;
}

export function LocationsRoute() {
  const { searchQuery } = useAdminSearch();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<PublicLocationRow[]>([]);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listPublicUserLocations({ limit: 300 });
      setRows(items);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load locations');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const rowsFiltered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    return rows.filter((r) => {
      const p = r.profile;
      return matchesAdminSearch(
        searchQuery,
        r.user_id,
        r.place_name,
        String(r.latitude),
        String(r.longitude),
        r.updated_at,
        p?.name,
        p?.student_id,
        p?.university_id,
      );
    });
  }, [rows, searchQuery]);

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Locations</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Users who set location sharing to <span className="font-black text-slate-700 dark:text-slate-200">public</span>.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              Rows filtered by the top search.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing {rowsFiltered.length}
              {searchQuery.trim() && rows.length !== rowsFiltered.length ? ` of ${rows.length}` : ''} public location
              {rowsFiltered.length === 1 ? '' : 's'}.
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
            >
              {busy ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {err ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
              {err}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[880px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Place</th>
                  <th className="px-3 py-2">Coordinates</th>
                  <th className="px-3 py-2">Map</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltered.map((r) => {
                  const p = r.profile;
                  const label = p?.student_id?.trim() || p?.name?.trim() || r.user_id.slice(0, 8) + '…';
                  return (
                    <tr
                      key={r.user_id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <td className="px-3 py-3 text-xs font-black text-slate-900 dark:text-slate-100">
                        {new Date(r.updated_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                        <div className="font-black">{label}</div>
                        {p?.name && p.student_id ? (
                          <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{p.name}</div>
                        ) : null}
                        {p?.university_id ? (
                          <div className="mt-0.5 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            {p.university_id}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {r.place_name?.trim() || '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}
                      </td>
                      <td className="px-3 py-3">
                        <a
                          href={mapsUrl(r.latitude, r.longitude)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-black text-brand-600 hover:underline dark:text-brand-400"
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  );
                })}
                {rowsFiltered.length === 0 && !busy ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                      {searchQuery.trim() && rows.length > 0
                        ? 'No rows match the top search.'
                        : 'No public locations yet.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </MotionPanel>
    </div>
  );
}
