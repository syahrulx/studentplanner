import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import {
  deleteTimetableEntry,
  insertTimetableEntry,
  listTimetableEntries,
  listTimetableUsersSummary,
  updateTimetableEntry,
  type TimetableEntryRow,
  type TimetableUserSummaryRow,
} from '../lib/api';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection } from '../ui/motion';
import { AdminTimetableGrid } from '../components/AdminTimetableGrid';
import {
  WEEK_DAYS_MON_FIRST,
  findConflictingTimetableEntry,
  minutesToHHMM,
  normalizeTimetableDay,
  parseTimeToMinutes,
  type WeekDayLabel,
} from '../lib/timetableGridUtils';

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

function userDisplayName(u: TimetableUserSummaryRow): string {
  const p = u.profile;
  const name = p?.name?.trim();
  if (name) return name;
  return formatUserLabel(p ?? undefined);
}

type EditorMode = { kind: 'edit'; row: TimetableEntryRow } | { kind: 'new' };

export function TimetablesRoute() {
  const { searchQuery } = useAdminSearch();
  const [universityId, setUniversityId] = useState('');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<TimetableEntryRow[]>([]);
  const [profilesByUserId, setProfilesByUserId] = useState<Record<string, ProfileRow>>({});
  const [universityOptions, setUniversityOptions] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<Array<{ userId: string; label: string; subtitle: string }>>([]);

  const [summaries, setSummaries] = useState<TimetableUserSummaryRow[]>([]);
  const [summariesBusy, setSummariesBusy] = useState(false);
  const [summariesErr, setSummariesErr] = useState('');

  const [timetableModalUserId, setTimetableModalUserId] = useState<string | null>(null);
  const [modalEntries, setModalEntries] = useState<TimetableEntryRow[]>([]);
  const [modalBusy, setModalBusy] = useState(false);

  const [editor, setEditor] = useState<EditorMode | null>(null);
  const [formDay, setFormDay] = useState('Monday');
  const [formStart, setFormStart] = useState('08:00');
  const [formEnd, setFormEnd] = useState('09:00');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formLecturer, setFormLecturer] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formGroup, setFormGroup] = useState('');
  const [formSemester, setFormSemester] = useState('');
  const [formDisplay, setFormDisplay] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [slotEditorErr, setSlotEditorErr] = useState('');

  const loadSummaries = useCallback(async () => {
    setSummariesBusy(true);
    setSummariesErr('');
    try {
      const list = await listTimetableUsersSummary();
      setSummaries(list);
    } catch (e) {
      setSummariesErr(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setSummariesBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadSummaries();
  }, [loadSummaries]);

  const openUserTimetable = async (uid: string) => {
    setTimetableModalUserId(uid);
    setModalBusy(true);
    setEditor(null);
    try {
      const items = await listTimetableEntries({ userId: uid, limit: 400 });
      setModalEntries(items);
      requestAnimationFrame(() => {
        document.getElementById('admin-timetable-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load timetable');
      setTimetableModalUserId(null);
    } finally {
      setModalBusy(false);
    }
  };

  const refreshModalEntries = async () => {
    if (!timetableModalUserId) return;
    setModalBusy(true);
    try {
      const items = await listTimetableEntries({ userId: timetableModalUserId, limit: 400 });
      setModalEntries(items);
    } finally {
      setModalBusy(false);
    }
  };

  const openEditorForRow = (row: TimetableEntryRow) => {
    setSlotEditorErr('');
    setEditor({ kind: 'edit', row });
    setFormDay(normalizeTimetableDay(row.day) ?? 'Monday');
    setFormStart(row.start_time);
    setFormEnd(row.end_time);
    setFormCode(row.subject_code);
    setFormName(row.subject_name);
    setFormLecturer(row.lecturer);
    setFormLocation(row.location);
    setFormGroup(row.group_name ?? '');
    setFormSemester(row.semester_label ?? '');
    setFormDisplay(row.display_name ?? '');
    setFormColor(row.slot_color ?? '');
  };

  const openNewSlot = () => {
    if (!timetableModalUserId) return;
    setSlotEditorErr('');
    setEditor({ kind: 'new' });
    setFormDay('Monday');
    setFormStart('08:00');
    setFormEnd('09:00');
    setFormCode('');
    setFormName('');
    setFormLecturer('');
    setFormLocation('');
    setFormGroup('');
    setFormSemester('');
    setFormDisplay('');
    setFormColor('');
  };

  const closeEditor = () => {
    setSlotEditorErr('');
    setEditor(null);
  };

  useEffect(() => {
    setSlotEditorErr('');
  }, [
    formDay,
    formStart,
    formEnd,
    formCode,
    formName,
    formLecturer,
    formLocation,
    formGroup,
    formSemester,
    formDisplay,
    formColor,
  ]);

  const saveEditor = async () => {
    if (!timetableModalUserId || !editor) return;
    const sm = parseTimeToMinutes(formStart.trim());
    const em = parseTimeToMinutes(formEnd.trim());
    if (sm == null || em == null || em <= sm) {
      setSlotEditorErr('Invalid start/end time (use HH:MM or HHMM).');
      return;
    }
    const dayCanonical: WeekDayLabel =
      (WEEK_DAYS_MON_FIRST as readonly string[]).includes(formDay)
        ? (formDay as WeekDayLabel)
        : normalizeTimetableDay(formDay) ?? 'Monday';

    const conflict = findConflictingTimetableEntry(modalEntries, {
      excludeEntryId: editor.kind === 'edit' ? editor.row.id : undefined,
      day: dayCanonical,
      startMin: sm,
      endMin: em,
    });
    if (conflict) {
      const label = (conflict.subject_name || conflict.subject_code || 'Another class').trim();
      setSlotEditorErr(
        `Time overlaps “${label}” (${conflict.subject_code} · ${conflict.day} ${conflict.start_time}–${conflict.end_time}). Change day or times so classes do not overlap.`,
      );
      return;
    }

    const startNorm = minutesToHHMM(sm);
    const endNorm = minutesToHHMM(em);
    setFormBusy(true);
    setErr('');
    setSlotEditorErr('');
    try {
      if (editor.kind === 'new') {
        await insertTimetableEntry({
          userId: timetableModalUserId,
          day: formDay,
          subject_code: formCode.trim() || 'N/A',
          subject_name: formName.trim() || formCode.trim() || 'Class',
          lecturer: formLecturer.trim() || '-',
          start_time: startNorm,
          end_time: endNorm,
          location: formLocation.trim() || '-',
          group_name: formGroup.trim() || null,
          semester_label: formSemester.trim() || null,
          display_name: formDisplay.trim() || null,
          slot_color: formColor.trim() || null,
        });
      } else {
        await updateTimetableEntry(timetableModalUserId, editor.row.id, {
          day: formDay,
          subject_code: formCode.trim(),
          subject_name: formName.trim(),
          lecturer: formLecturer.trim() || '-',
          start_time: startNorm,
          end_time: endNorm,
          location: formLocation.trim() || '-',
          group_name: formGroup.trim() || null,
          semester_label: formSemester.trim() || null,
          display_name: formDisplay.trim() || null,
          slot_color: formColor.trim() || null,
        });
      }
      await refreshModalEntries();
      await loadSummaries();
      closeEditor();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErr(msg);
      setSlotEditorErr(msg);
    } finally {
      setFormBusy(false);
    }
  };

  const deleteEditorRow = async () => {
    if (!timetableModalUserId || !editor || editor.kind !== 'edit') return;
    const ok = confirm('Delete this timetable slot?');
    if (!ok) return;
    setFormBusy(true);
    setErr('');
    try {
      await deleteTimetableEntry(editor.row.id, timetableModalUserId);
      await refreshModalEntries();
      await loadSummaries();
      closeEditor();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setFormBusy(false);
    }
  };

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

  const summariesFiltered = useMemo(() => {
    if (!searchQuery.trim()) return summaries;
    return summaries.filter((u) => {
      const p = u.profile;
      return matchesAdminSearch(
        searchQuery,
        u.user_id,
        p?.name,
        p?.student_id,
        p?.university_id,
        String(u.entry_count),
      );
    });
  }, [summaries, searchQuery]);

  const rowsFiltered = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    return rows.filter((r) => {
      const p = profilesByUserId[r.user_id];
      return matchesAdminSearch(
        searchQuery,
        r.user_id,
        r.day,
        r.subject_code,
        r.subject_name,
        r.start_time,
        r.end_time,
        r.location,
        r.lecturer,
        p?.name,
        p?.student_id,
        p?.university_id,
      );
    });
  }, [rows, searchQuery, profilesByUserId]);

  const groupedFilteredCount = useMemo(() => new Set(rowsFiltered.map((r) => r.user_id)).size, [rowsFiltered]);

  const modalProfile =
    timetableModalUserId != null
      ? summaries.find((s) => s.user_id === timetableModalUserId)?.profile ??
        profilesByUserId[timetableModalUserId] ??
        null
      : null;

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Timetables</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          All students with timetable data are listed first. Click a student to open their week grid below.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              Lists filtered by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionSection delay={0.04} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900 dark:text-slate-100">Students</div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {summariesBusy ? 'Loading…' : `${summariesFiltered.length} with timetables`} — click a row to view their timetable.
                </div>
              </div>
              <button
                type="button"
                onClick={() => void loadSummaries()}
                disabled={summariesBusy}
                className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                Refresh list
              </button>
            </div>
            {summariesErr ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {summariesErr}
              </div>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Student ID</th>
                    <th className="px-3 py-2">University</th>
                    <th className="px-3 py-2 text-right">Slots</th>
                  </tr>
                </thead>
                <tbody>
                  {summariesFiltered.map((u) => {
                    const p = u.profile;
                    const selected = timetableModalUserId === u.user_id;
                    return (
                      <tr
                        key={u.user_id}
                        className={`cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-800/40 ${
                          selected ? 'bg-brand-500/12 dark:bg-brand-500/20' : ''
                        }`}
                        onClick={() => void openUserTimetable(u.user_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void openUserTimetable(u.user_id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open timetable for ${userDisplayName(u)}`}
                        aria-selected={selected}
                      >
                        <td className="px-3 py-2">
                          <span className="font-black text-brand-600 dark:text-brand-400">{userDisplayName(u)}</span>
                          <div className="text-[10px] font-mono font-semibold text-slate-400">{u.user_id}</div>
                        </td>
                        <td className="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200">
                          {p?.student_id?.trim() || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p?.university_id?.trim() || '—'}</td>
                        <td className="px-3 py-2 text-right font-black text-slate-900 dark:text-slate-100">
                          {u.entry_count}
                        </td>
                      </tr>
                    );
                  })}
                  {summariesFiltered.length === 0 && !summariesBusy ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center font-semibold text-slate-500 dark:text-slate-400">
                        No users with timetable rows yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>

      {timetableModalUserId ? (
        <MotionSection delay={0.02} className="mt-6">
          <MotionPanel>
            <div
              id="admin-timetable-panel"
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Timetable
                  </div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {userDisplayName({
                      user_id: timetableModalUserId,
                      entry_count: modalEntries.length,
                      profile: modalProfile ?? null,
                    })}
                  </h2>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {modalProfile?.student_id?.trim() || '—'} · {modalProfile?.university_id?.trim() || '—'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void refreshModalEntries()}
                    disabled={modalBusy}
                    className="h-10 rounded-2xl border border-slate-200 px-4 text-xs font-black text-slate-900 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {modalBusy ? 'Loading…' : 'Reload grid'}
                  </button>
                  <button
                    type="button"
                    onClick={openNewSlot}
                    className="h-10 rounded-2xl bg-brand-600 px-4 text-xs font-black text-white hover:bg-brand-700"
                  >
                    Add slot
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTimetableModalUserId(null);
                      setModalEntries([]);
                      setSlotEditorErr('');
                      setEditor(null);
                    }}
                    className="h-10 rounded-2xl bg-slate-900 px-4 text-xs font-black text-white hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    Close timetable
                  </button>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Click a class block to edit. Overlapping times on the same day are blocked when saving.
              </p>
              <div className="mt-4">
                {modalBusy && modalEntries.length === 0 ? (
                  <div className="py-16 text-center font-semibold text-slate-500">Loading timetable…</div>
                ) : (
                  <AdminTimetableGrid entries={modalEntries} onSlotClick={openEditorForRow} />
                )}
              </div>
            </div>
          </MotionPanel>
        </MotionSection>
      ) : null}

      {editor
        ? createPortal(
                  <div
                    className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-3 backdrop-blur-[1px] sm:p-4"
                    role="presentation"
                    onClick={() => {
                      if (!formBusy) closeEditor();
                    }}
                  >
                    <div
                      className="flex max-h-[min(88dvh,860px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-900"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="slot-editor-title"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 pb-3 pt-5 dark:border-slate-800">
                        <div className="min-w-0">
                          <h3
                            id="slot-editor-title"
                            className="text-lg font-black text-slate-900 dark:text-slate-100"
                          >
                            {editor.kind === 'new' ? 'Add timetable slot' : 'Class details'}
                          </h3>
                          {editor.kind === 'edit' ? (
                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {editor.row.subject_code} · {editor.row.day} · {editor.row.start_time}–{editor.row.end_time}
                              {editor.row.id ? (
                                <span className="ml-2 font-mono text-[10px] opacity-70">id {editor.row.id}</span>
                              ) : null}
                            </p>
                          ) : (
                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Fill in the fields below, then save. Times must not overlap another class on the same day.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => !formBusy && closeEditor()}
                          disabled={formBusy}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-lg font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                          aria-label="Close editor"
                        >
                          ×
                        </button>
                      </div>
                      {slotEditorErr ? (
                        <div className="shrink-0 border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-100">
                          {slotEditorErr}
                        </div>
                      ) : null}
                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Day
                    <select
                      value={formDay}
                      onChange={(e) => setFormDay(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {WEEK_DAYS_MON_FIRST.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Start
                    <input
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="08:00"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    End
                    <input
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="10:00"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Subject code
                    <input
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Subject name
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Lecturer
                    <input
                      value={formLecturer}
                      onChange={(e) => setFormLecturer(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Location
                    <input
                      value={formLocation}
                      onChange={(e) => setFormLocation(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Group
                    <input
                      value={formGroup}
                      onChange={(e) => setFormGroup(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Semester label
                    <input
                      value={formSemester}
                      onChange={(e) => setFormSemester(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Display name
                    <input
                      value={formDisplay}
                      onChange={(e) => setFormDisplay(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase text-slate-600 dark:text-slate-400">
                    Slot color (CSS)
                    <input
                      value={formColor}
                      onChange={(e) => setFormColor(e.target.value)}
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      placeholder="#22c55e or hsl(200 70% 40%)"
                    />
                  </label>
                </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-950/80">
                  <button
                    type="button"
                    onClick={() => void saveEditor()}
                    disabled={formBusy}
                    className="h-10 rounded-2xl bg-brand-600 px-5 text-xs font-black text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {formBusy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    disabled={formBusy}
                    className="h-10 rounded-2xl border border-slate-200 px-5 text-xs font-black text-slate-900 dark:border-slate-600 dark:text-slate-100"
                  >
                    Cancel
                  </button>
                  {editor.kind === 'edit' ? (
                    <button
                      type="button"
                      onClick={() => void deleteEditorRow()}
                      disabled={formBusy}
                      className="h-10 rounded-2xl bg-rose-600 px-5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-60"
                    >
                      Delete slot
                    </button>
                  ) : null}
                      </div>
                    </div>
                  </div>,
                  document.body,
                )
        : null}

      <MotionSection delay={0.1} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 text-sm font-black text-slate-900 dark:text-slate-100">Raw rows (filters)</div>
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
                  onClick={() => void refresh()}
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
              Showing {rowsFiltered.length} entries across {groupedFilteredCount} users
              {searchQuery.trim() ? ' (filtered)' : ''} (max 200 rows loaded)
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
                  {rowsFiltered.map((r) => (
                    <tr
                      key={`${r.user_id}-${r.id}-${r.day}-${r.start_time}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40"
                    >
                      <td className="px-3 py-3 text-xs font-black text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() => void openUserTimetable(r.user_id)}
                          className="text-left font-black text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {formatUserLabel(profilesByUserId[r.user_id])}
                        </button>
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
                            await loadSummaries();
                          }}
                        >
                          Delete row
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rowsFiltered.length === 0 && !busy ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-sm font-semibold text-slate-500 dark:text-slate-400"
                      >
                        {searchQuery.trim() && rows.length > 0
                          ? 'No rows match the top search.'
                          : 'No timetable entries found.'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </MotionPanel>
      </MotionSection>
    </div>
  );
}
