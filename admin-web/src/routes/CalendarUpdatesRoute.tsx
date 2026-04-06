import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  insertUniversityCalendarOffers,
  listUniversities,
  listUniversityCalendarOffers,
  type AdminCalendarOfferRow,
  type AdminCalendarOfferInsert,
  type UniversityRow,
} from '../lib/api';
import { supabase } from '../lib/supabase';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Label, TextInput } from '../ui/Input';
import { matchesAdminSearch } from '../lib/adminSearch';
import { useAdminSearch } from '../state/AdminSearchContext';
import { MotionPanel, MotionSection, MotionStagger, MotionStaggerItem } from '../ui/motion';
import { AcademicCalendarOfferGraphic } from '../components/AcademicCalendarOfferGraphic';

const BUCKET = 'academic-calendar-refs';

function eligibleUniversities(list: UniversityRow[]): UniversityRow[] {
  return list.filter((u) => u.id !== 'uitm').sort((a, b) => a.name.localeCompare(b.name));
}

export function CalendarUpdatesRoute() {
  const { searchQuery } = useAdminSearch();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<AdminCalendarOfferRow[]>([]);
  const [semesterLabel, setSemesterLabel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalWeeks, setTotalWeeks] = useState('14');
  const [breakStart, setBreakStart] = useState('');
  const [breakEnd, setBreakEnd] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [periodsJson, setPeriodsJson] = useState('');

  const eligible = useMemo(() => eligibleUniversities(universities), [universities]);

  const universityNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of universities) m.set(u.id, u.name);
    return m;
  }, [universities]);

  const refreshUniversities = async () => {
    const all = await listUniversities();
    setUniversities(all);
  };

  const refreshHistory = async () => {
    const items = await listUniversityCalendarOffers({ limit: 150 });
    setHistory(items);
  };

  useEffect(() => {
    void (async () => {
      setErr('');
      try {
        await refreshUniversities();
        await refreshHistory();
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
  }, []);

  const toggleUni = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllEligible = () => {
    setSelected(new Set(eligible.map((u) => u.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    return history.filter((h) =>
      matchesAdminSearch(
        searchQuery,
        h.university_id,
        universityNameById.get(h.university_id) ?? '',
        h.semester_label,
        h.admin_note ?? '',
        h.official_url ?? '',
      ),
    );
  }, [history, searchQuery, universityNameById]);

  const publish = async () => {
    setErr('');
    setOkMsg('');
    const ids = Array.from(selected);
    if (!ids.length) {
      setErr('Select at least one university (UiTM is excluded; it keeps the portal calendar).');
      return;
    }
    const label = semesterLabel.trim();
    const sd = startDate.trim().slice(0, 10);
    const ed = endDate.trim().slice(0, 10);
    if (!label) {
      setErr('Semester label is required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
      setErr('Start and end dates must be valid YYYY-MM-DD.');
      return;
    }
    if (sd > ed) {
      setErr('Start date must be on or before end date.');
      return;
    }
    const tw = Math.max(1, Math.min(52, Number(totalWeeks) || 14));
    let periods: unknown | null = null;
    const pj = periodsJson.trim();
    if (pj) {
      try {
        const parsed = JSON.parse(pj) as unknown;
        if (!Array.isArray(parsed)) {
          setErr('Periods JSON must be a JSON array (or leave empty).');
          return;
        }
        periods = parsed;
      } catch {
        setErr('Periods JSON is not valid JSON.');
        return;
      }
    }
    const bs = breakStart.trim().slice(0, 10);
    const be = breakEnd.trim().slice(0, 10);
    const break_start = /^\d{4}-\d{2}-\d{2}$/.test(bs) ? bs : null;
    const break_end = /^\d{4}-\d{2}-\d{2}$/.test(be) ? be : null;

    setBusy(true);
    try {
      let pdfUrl: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file && file.size > 0) {
        const key = globalThis.crypto.randomUUID();
        const path = `batch/${key}.pdf`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: 'application/pdf',
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        pdfUrl = pub.publicUrl;
      }

      const url = officialUrl.trim() || null;
      const note = adminNote.trim() || null;

      const rows: AdminCalendarOfferInsert[] = ids.map((university_id) => ({
        university_id,
        semester_label: label,
        start_date: sd,
        end_date: ed,
        total_weeks: tw,
        break_start_date: break_start,
        break_end_date: break_end,
        periods_json: periods,
        official_url: url,
        reference_pdf_url: pdfUrl,
        admin_note: note,
      }));

      await insertUniversityCalendarOffers(rows);
      setOkMsg(`Published ${rows.length} offer(s). Students at those universities will be prompted before their app calendar changes.`);
      clearSelection();
      if (fileRef.current) fileRef.current.value = '';
      await refreshHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Academic calendar updates</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Publish semester dates, an official link, and an optional reference PDF for Malaysian universities (other than UiTM).
          Students must confirm in the app before their planner calendar is updated.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              History table filtered by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Publish new offer</CardTitle>
            <CardDescription>
              Choose one or more universities. Each selection gets its own offer row (same dates/links). UiTM cannot be selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {err ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {err}
              </div>
            ) : null}
            {okMsg ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                {okMsg}
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <div className="text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Universities</div>
                {eligible.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="text-xs font-bold text-brand-600 dark:text-brand-400"
                      onClick={selectAllEligible}
                    >
                      Select all
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <button type="button" className="text-xs font-bold text-slate-500" onClick={clearSelection}>
                      Clear
                    </button>
                  </>
                ) : null}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
                {eligible.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {eligible.map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <input
                          type="checkbox"
                          checked={selected.has(u.id)}
                          onChange={() => toggleUni(u.id)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>
                          {u.name} <span className="text-slate-400">({u.id})</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : universities.length === 0 ? (
                  <div className="space-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <p>There are no rows in the <code className="rounded bg-slate-200/80 px-1 font-mono text-xs dark:bg-slate-800">universities</code> table yet.</p>
                    <p>
                      Add institutions under{' '}
                      <Link to="/universities" className="font-bold text-brand-600 underline dark:text-brand-400">
                        Universities
                      </Link>{' '}
                      first; then they will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    <p>
                      Calendar offers intentionally exclude <strong>UiTM</strong> (students use the portal academic calendar). No other universities are configured in the database
                      {universities.some((u) => u.id === 'uitm') ? ' besides UiTM' : ''}.
                    </p>
                    <p>
                      Add another university under{' '}
                      <Link to="/universities" className="font-bold text-brand-600 underline dark:text-brand-400">
                        Universities
                      </Link>{' '}
                      to publish offers for it.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Semester label
                </span>
                <TextInput value={semesterLabel} onChange={(e) => setSemesterLabel(e.target.value)} placeholder="e.g. Semester 1 2025/2026" />
              </Label>
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Total teaching weeks
                </span>
                <TextInput value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value)} placeholder="14" inputMode="numeric" />
              </Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Start date</span>
                <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Label>
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">End date</span>
                <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Break start (optional)
                </span>
                <TextInput type="date" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
              </Label>
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Break end (optional)
                </span>
                <TextInput type="date" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
              </Label>
            </div>

            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Official link (optional)
              </span>
              <TextInput value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://…" />
            </Label>

            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Reference PDF (optional)
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="block w-full text-sm font-semibold text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white dark:text-slate-200"
              />
            </Label>

            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Admin note to students (optional)
              </span>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                placeholder="Short message shown in the app prompt"
              />
            </Label>

            <Label className="block">
              <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                Periods JSON (optional, advanced)
              </span>
              <textarea
                value={periodsJson}
                onChange={(e) => setPeriodsJson(e.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                placeholder='[{"type":"lecture","label":"…","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]'
              />
            </Label>

            <Button type="button" disabled={busy} onClick={() => void publish()} className="w-full sm:w-auto">
              {busy ? 'Publishing…' : 'Publish offers'}
            </Button>
          </CardContent>
        </Card>
      </MotionPanel>

      <MotionSection className="mt-10">
        <div className="text-lg font-black text-slate-900 dark:text-slate-100">Existing offers</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Newest first. Each row shows the university, semester span, and a visual timeline (phases from periods JSON when present).
        </div>
      </MotionSection>

      <MotionStagger className="mt-4 space-y-3">
        {filteredHistory.map((h) => (
          <MotionStaggerItem key={h.id}>
            <Card>
              <CardContent className="space-y-4 py-4">
                <AcademicCalendarOfferGraphic
                  offer={h}
                  universityName={universityNameById.get(h.university_id) ?? h.university_id}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                    Published {new Date(h.created_at).toLocaleString()}
                  </div>
                </div>
                {h.admin_note ? <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{h.admin_note}</div> : null}
                <div className="flex flex-wrap gap-3 text-xs font-bold">
                  {h.official_url ? (
                    <a href={h.official_url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400">
                      Link
                    </a>
                  ) : null}
                  {h.reference_pdf_url ? (
                    <a href={h.reference_pdf_url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400">
                      PDF
                    </a>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </MotionStaggerItem>
        ))}
        {filteredHistory.length === 0 ? (
          <div className="text-sm font-semibold text-slate-500">No offers yet.</div>
        ) : null}
      </MotionStagger>
    </div>
  );
}
