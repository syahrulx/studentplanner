import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { deleteTimetableEntry, listTimetableEntries, type TimetableEntryRow } from '../lib/api';

type TimetableRow = TimetableEntryRow;

type ProfileRow = {
  id: string;
  name: string | null;
  student_id: string | null;
  university_id: string | null;
};

function formatUserLabel(p: ProfileRow | null | undefined): string {
  const student = p?.student_id?.trim();
  if (student) return student;
  return '—';
}

export function TimetablesRoute() {
  const [universityId, setUniversityId] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<TimetableRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRow>>({});
  const [universityOptions, setUniversityOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<Array<{ userId: string; label: string; subtitle: string }>>([]);

  const refresh = async () => {
    setBusy(true);
    setErr('');
    try {
      const items = await listTimetableEntries({
        userId: userId.trim() || undefined,
        universityId: universityId.trim() || undefined,
        limit: 200,
      });
      setRows(items);

      // Enrich rows with student display info (avoids showing raw UUIDs in the table).
      const ids = Array.from(new Set((items ?? []).map((x) => x.user_id))).filter(Boolean);
      if (ids.length) {
        const { data: profs, error: pe } = await supabase
          .from('profiles')
          .select('id,name,student_id,university_id')
          .in('id', ids);
        if (!pe && profs) {
          const map: Record<string, ProfileRow> = {};
          for (const p of profs as ProfileRow[]) map[p.id] = p;
          setProfilesByUserId(map);

          const universities = Array.from(
            new Set((profs as ProfileRow[]).map((p) => (p.university_id ?? '').trim()).filter(Boolean)),
          ).sort((a, b) => a.localeCompare(b));
          setUniversityOptions(universities);

          const users = (profs as ProfileRow[])
            .slice()
            .sort((a, b) => (a.student_id || '').localeCompare(b.student_id || ''))
            .map((p) => ({
              userId: p.id,
              label: formatUserLabel(p),
              subtitle: p.name?.trim() || '—',
            }));
          // Deduplicate by userId (should already be unique, but keeps it safe).
          const seen = new Set<string>();
          setUserOptions(users.filter((u) => (seen.has(u.userId) ? false : (seen.add(u.userId), true))));
        }
      } else {
        setProfilesByUserId({});
        setUniversityOptions([]);
        setUserOptions([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load timetables');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groupedCount = useMemo(() => new Set(rows.map((r) => r.user_id)).size, [rows]);

  return (
    <div>
      <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Timetables</div>
      <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
        View and manage generated timetables.
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <label className="block md:w-64">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                University
              </div>
              <select
                value={universityId}
                onChange={(e) => setUniversityId(e.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All universities</option>
                {universityOptions.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>

            <label className="block flex-1">
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Student
              </div>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All students</option>
                {userOptions.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.label} - {u.subtitle}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => {
                setUniversityId('');
                setUserId('');
                void refresh();
              }}
              disabled={busy}
              className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 shadow-sm hover:bg-slate-50 disabled:opacity-70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              onClick={refresh}
              disabled={busy}
              className="h-11 rounded-2xl bg-brand-600 px-4 text-sm font-black text-white shadow-soft hover:bg-brand-700 disabled:opacity-70"
            >
              {busy ? 'Loading…' : 'Apply'}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
            {err}
          </div>
        ) : null}

        <div className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Showing {rows.length} entries across {groupedCount} users (max 200 rows)
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-2">
            <thead>
              <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.user_id}-${r.id}-${r.day}-${r.start_time}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                  <td className="px-3 py-3 text-xs font-black text-slate-900 dark:text-slate-100">
                    <div>{formatUserLabel(profilesByUserId[r.user_id])}</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {profilesByUserId[r.user_id]?.name?.trim() || r.user_id}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.day}</td>
                  <td className="px-3 py-3 text-sm">
                    <div className="font-black text-slate-900 dark:text-slate-100">{r.subject_code}</div>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.subject_name}</div>
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {r.start_time}–{r.end_time}
                  </td>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">{r.location}</td>
                  <td className="px-3 py-3">
                    <button
                      className="h-9 rounded-xl bg-slate-900 px-3 text-xs font-black text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                      onClick={async () => {
                        const ok = confirm('Delete this timetable entry row?');
                        if (!ok) return;
                        await deleteTimetableEntry(r.id, r.user_id);
                        await refresh();
                      }}
                    >
                      Delete row
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !busy ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                    No timetable entries found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

