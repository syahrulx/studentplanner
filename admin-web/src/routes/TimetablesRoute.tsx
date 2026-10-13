import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { MotionSection } from '../ui/motion';
import { Button } from '../ui/Button';
import { Label, Select, TextInput } from '../ui/Input';
import { cn } from '../ui/cn';
import { EmptyState, Notice, PageHeader, Panel, SidePanel, SkeletonRows } from '../ui/page';
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
    if (timetableModalUserId === uid) {
      setTimetableModalUserId(null);
      setModalEntries([]);
      setEditor(null);
      setSlotEditorErr('');
      return;
    }
    setTimetableModalUserId(uid);
    setModalBusy(true);
    setEditor(null);
    try {
      const items = await listTimetableEntries({ userId: uid, limit: 400 });
      setModalEntries(items);
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-student-timetable-row="${uid}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
        const PROFILE_CHUNK = 100;
        const profs: ProfileRow[] = [];
        for (let i = 0; i < ids.length; i += PROFILE_CHUNK) {
          const slice = ids.slice(i, i + PROFILE_CHUNK);
          const { data: chunk, error: pe } = await supabase
            .from('profiles')
            .select('id,name,student_id,university_id')
            .in('id', slice);
          if (pe) throw pe;
          if (chunk?.length) profs.push(...(chunk as ProfileRow[]));
        }
        if (profs.length) {
          const map: Record<string, ProfileRow> = {};
          for (const p of profs) map[p.id] = p;
          setProfilesByUserId(map);

          const universities = Array.from(
            new Set(profs.map((p) => (p.university_id ?? '').trim()).filter(Boolean)),
          ).sort((a, b) => a.localeCompare(b));
          setUniversityOptions(universities);

          const users = profs
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

  const summaryRowForModal: TimetableUserSummaryRow | null =
    timetableModalUserId != null
      ? summaries.find((s) => s.user_id === timetableModalUserId) ?? {
          user_id: timetableModalUserId,
          entry_count: modalEntries.length,
          profile: modalProfile,
        }
      : null;

  const closeTimetable = () => {
    setTimetableModalUserId(null);
    setModalEntries([]);
    setSlotEditorErr('');
    setEditor(null);
  };

  // While a class is open, closing the panel goes back to the grid (like the old editor window).
  const onPanelClose = () => {
    if (editor) {
      if (!formBusy) closeEditor();
      return;
    }
    closeTimetable();
  };

  const searching = Boolean(searchQuery.trim());

  const slotFields: Array<{ label: string; value: string; set: (v: string) => void; placeholder?: string }> = [
    { label: 'Start', value: formStart, set: setFormStart, placeholder: '08:00' },
    { label: 'End', value: formEnd, set: setFormEnd, placeholder: '10:00' },
    { label: 'Subject code', value: formCode, set: setFormCode },
    { label: 'Subject name', value: formName, set: setFormName },
    { label: 'Lecturer', value: formLecturer, set: setFormLecturer },
    { label: 'Location', value: formLocation, set: setFormLocation },
    { label: 'Group', value: formGroup, set: setFormGroup },
    { label: 'Semester label', value: formSemester, set: setFormSemester },
    { label: 'Display name', value: formDisplay, set: setFormDisplay },
    { label: 'Slot colour (CSS)', value: formColor, set: setFormColor, placeholder: '#22c55e or hsl(200 70% 40%)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Timetables"
        description="Click a student to open their week grid, then click a class to edit it."
      />

      {searching ? <Notice tone="brand">Top search is on. Both lists below are filtered.</Notice> : null}
      {err ? <Notice tone="danger">{err}</Notice> : null}

      <MotionSection>
        <Panel
          title="Students"
          description={summariesBusy ? 'Loading…' : `${summariesFiltered.length} with timetables`}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void loadSummaries()} disabled={summariesBusy}>
              Refresh list
            </Button>
          }
          padded={false}
        >
          {summariesErr ? <Notice tone="danger" className="m-5 mb-0">{summariesErr}</Notice> : null}
          {summariesBusy && summaries.length === 0 ? (
            <div className="p-5"><SkeletonRows rows={4} height="h-12" /></div>
          ) : summariesFiltered.length === 0 ? (
            <div className="p-5"><EmptyState title="No users with timetable rows yet." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-3 py-2.5">Student ID</th>
                    <th className="px-3 py-2.5">University</th>
                    <th className="px-5 py-2.5 text-right">Slots</th>
                  </tr>
                </thead>
                <tbody>
                  {summariesFiltered.map((u) => {
                    const p = u.profile;
                    const selected = timetableModalUserId === u.user_id;
                    return (
                      <tr
                        key={u.user_id}
                        data-student-timetable-row={u.user_id}
                        className={cn(
                          'cursor-pointer border-t border-slate-100 transition-colors focus:outline-none focus-visible:bg-slate-50 dark:border-slate-800 dark:focus-visible:bg-slate-800/40',
                          selected
                            ? 'bg-brand-50 dark:bg-brand-900/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
                        )}
                        onClick={() => void openUserTimetable(u.user_id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void openUserTimetable(u.user_id);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-expanded={selected}
                        aria-label={`Open timetable for ${userDisplayName(u)}`}
                        aria-selected={selected}
                      >
                        <td className="px-5 py-2.5">
                          <div className="font-black text-slate-900 dark:text-slate-100">{userDisplayName(u)}</div>
                          <div className="break-all font-mono text-[10px] font-semibold text-slate-400 dark:text-slate-500">{u.user_id}</div>
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{p?.student_id?.trim() || '—'}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-600 dark:text-slate-300">{p?.university_id?.trim() || '—'}</td>
                        <td className="px-5 py-2.5 text-right font-black tabular-nums text-slate-900 dark:text-slate-100">{u.entry_count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </MotionSection>

      <MotionSection delay={0.06}>
        <Panel
          title="All timetable rows"
          description={`Showing ${rowsFiltered.length} entries across ${groupedFilteredCount} users${searching ? ' (filtered)' : ''} · max 200 rows loaded`}
          padded={false}
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 p-5 md:flex-row md:items-end dark:border-slate-800">
            <div className="md:w-64">
              <Label htmlFor="tt-university" className="mb-1">University</Label>
              <Select id="tt-university" value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
                <option value="">All universities</option>
                {universityOptions.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="tt-student" className="mb-1">Student</Label>
              <Select id="tt-student" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">All students</option>
                {userOptions.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.label} - {u.subtitle}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setUniversityId('');
                  setUserId('');
                  void refresh();
                }}
                disabled={busy}
              >
                Reset
              </Button>
              <Button onClick={() => void refresh()} disabled={busy}>
                {busy ? 'Loading…' : 'Apply'}
              </Button>
            </div>
          </div>

          {busy && rows.length === 0 ? (
            <div className="p-5"><SkeletonRows rows={4} height="h-12" /></div>
          ) : rowsFiltered.length === 0 ? (
            !busy ? (
              <div className="p-5">
                <EmptyState
                  title={searching && rows.length > 0 ? 'No rows match the top search.' : 'No timetable entries found.'}
                />
              </div>
            ) : null
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5">User</th>
                    <th className="px-3 py-2.5">Class</th>
                    <th className="px-3 py-2.5">When</th>
                    <th className="hidden px-3 py-2.5 md:table-cell">Location</th>
                    <th className="px-5 py-2.5 text-right"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsFiltered.map((r) => (
                    <tr key={`${r.user_id}-${r.id}-${r.day}-${r.start_time}`} className="border-t border-slate-100 align-top dark:border-slate-800">
                      <td className="px-5 py-2.5">
                        <button
                          type="button"
                          onClick={() => void openUserTimetable(r.user_id)}
                          className="text-left font-black text-brand-600 hover:underline dark:text-brand-400"
                          title="Open this student's week grid"
                        >
                          {formatUserLabel(profilesByUserId[r.user_id])}
                        </button>
                        <div className="mt-0.5 break-all text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          {profilesByUserId[r.user_id]?.name?.trim() || r.user_id}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-black text-slate-900 dark:text-slate-100">{r.subject_code}</div>
                        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.subject_name}</div>
                        <div className="text-xs font-semibold text-slate-500 md:hidden dark:text-slate-400">{r.location}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200">
                        <div>{r.day}</div>
                        <div className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{r.start_time}–{r.end_time}</div>
                      </td>
                      <td className="hidden px-3 py-2.5 font-semibold text-slate-700 md:table-cell dark:text-slate-200">{r.location}</td>
                      <td className="px-5 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          onClick={async () => {
                            const ok = confirm('Delete this timetable entry row?');
                            if (!ok) return;
                            await deleteTimetableEntry(r.id, r.user_id);
                            await refresh();
                            await loadSummaries();
                          }}
                        >
                          Delete row
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </MotionSection>

      {timetableModalUserId && summaryRowForModal ? (
        <SidePanel
          width="max-w-5xl"
          title={userDisplayName(summaryRowForModal)}
          subtitle={`${modalProfile?.student_id?.trim() || '—'} · ${modalProfile?.university_id?.trim() || '—'}`}
          onClose={onPanelClose}
          footer={
            editor ? (
              <>
                {editor.kind === 'edit' ? (
                  <Button variant="danger" size="sm" className="mr-auto" onClick={() => void deleteEditorRow()} disabled={formBusy}>
                    Delete slot
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={closeEditor} disabled={formBusy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void saveEditor()} disabled={formBusy}>
                  {formBusy ? 'Saving…' : 'Save'}
                </Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" onClick={() => void refreshModalEntries()} disabled={modalBusy}>
                  {modalBusy ? 'Loading…' : 'Reload grid'}
                </Button>
                <Button size="sm" onClick={openNewSlot}>
                  Add slot
                </Button>
              </>
            )
          }
        >
          {editor ? (
            <section aria-labelledby="slot-editor-title" className="space-y-4">
              <div>
                <h3 id="slot-editor-title" className="text-base font-black text-slate-900 dark:text-slate-100">
                  {editor.kind === 'new' ? 'Add timetable slot' : 'Class details'}
                </h3>
                {editor.kind === 'edit' ? (
                  <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {editor.row.subject_code} · {editor.row.day} · {editor.row.start_time}–{editor.row.end_time}
                    {editor.row.id ? <span className="ml-2 font-mono text-[10px] opacity-70">id {editor.row.id}</span> : null}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Fill in the fields below, then save. Times must not overlap another class on the same day.
                  </p>
                )}
              </div>
              {slotEditorErr ? <Notice tone="danger">{slotEditorErr}</Notice> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="slot-day" className="mb-1">Day</Label>
                  <Select id="slot-day" value={formDay} onChange={(e) => setFormDay(e.target.value)}>
                    {WEEK_DAYS_MON_FIRST.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Select>
                </div>
                {slotFields.map((f) => {
                  const id = `slot-${f.label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
                  return (
                    <div key={f.label}>
                      <Label htmlFor={id} className="mb-1">{f.label}</Label>
                      <TextInput id={id} value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder} />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Click a class to edit it. Times that overlap on the same day are blocked when saving.
              </p>
              {modalBusy && modalEntries.length === 0 ? (
                <SkeletonRows rows={1} height="h-96" />
              ) : (
                <>
                  {modalEntries.length === 0 ? (
                    <Notice tone="neutral">No classes yet. Use Add slot to create one.</Notice>
                  ) : null}
                  <AdminTimetableGrid entries={modalEntries} onSlotClick={openEditorForRow} />
                </>
              )}
            </>
          )}
        </SidePanel>
      ) : null}
    </div>
  );
}
