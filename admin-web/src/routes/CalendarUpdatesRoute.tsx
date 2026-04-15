import { useEffect, useMemo, useRef, useState } from 'react';
import {
  extractCalendarFromUrl,
  deleteUniversityCalendarOffer,
  insertUniversityCalendarOffers,
  listUniversities,
  listUniversityCalendarOffers,
  upsertUniversity,
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

/**
 * Must match the UNIVERSITIES list in gradeup-mobile/src/lib/universities.ts.
 * UiTM is excluded here because it uses the portal calendar (HEA).
 */
const APP_UNIVERSITIES: { id: string; name: string }[] = [
  { id: 'um', name: 'Universiti Malaya' },
  { id: 'utm', name: 'Universiti Teknologi Malaysia' },
  { id: 'ukm', name: 'Universiti Kebangsaan Malaysia' },
  { id: 'upm', name: 'Universiti Putra Malaysia' },
  { id: 'usm', name: 'Universiti Sains Malaysia' },
  { id: 'uiam', name: 'Universiti Islam Antarabangsa Malaysia' },
  { id: 'unimas', name: 'Universiti Malaysia Sarawak' },
  { id: 'ums', name: 'Universiti Malaysia Sabah' },
  { id: 'upsi', name: 'Universiti Pendidikan Sultan Idris' },
  { id: 'uthm', name: 'Universiti Tun Hussein Onn Malaysia' },
  { id: 'umt', name: 'Universiti Malaysia Terengganu' },
  { id: 'unimap', name: 'Universiti Malaysia Perlis' },
  { id: 'ump', name: 'Universiti Malaysia Pahang Al-Sultan Abdullah' },
  { id: 'unisel', name: 'Universiti Selangor' },
  { id: 'mmu', name: 'Multimedia University' },
  { id: 'uniten', name: 'Universiti Tenaga Nasional' },
  { id: 'utp', name: 'Universiti Teknologi PETRONAS' },
  { id: 'taylors', name: "Taylor's University" },
  { id: 'sunway', name: 'Sunway University' },
  { id: 'utem', name: 'Universiti Teknikal Malaysia Melaka' },
];

function eligibleUniversities(list: UniversityRow[]): UniversityRow[] {
  return list.filter((u) => u.id !== 'uitm').sort((a, b) => a.name.localeCompare(b.name));
}

export function CalendarUpdatesRoute() {
  const { searchQuery, clearSearch } = useAdminSearch();
  const fileRef = useRef<HTMLInputElement>(null);
  const uniComboRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [universitySearch, setUniversitySearch] = useState('');
  const [universityOpen, setUniversityOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(true);
  const [offersOpen, setOffersOpen] = useState(true);
  const [offersSearch, setOffersSearch] = useState('');
  const [offersUni, setOffersUni] = useState('');
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

  // ── Auto-extract state ──
  const [extractUrl, setExtractUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState('');
  const [extractOk, setExtractOk] = useState('');
  const [extractCandidates, setExtractCandidates] = useState<
    Array<{
      program_level?: string;
      semester_label?: string;
      start_date?: string;
      end_date?: string;
      total_weeks?: number;
      break_start_date?: string | null;
      break_end_date?: string | null;
      periods?: Array<{ type: string; label: string; startDate: string; endDate: string }>;
    }>
  >([]);
  const [extractCandidateIdx, setExtractCandidateIdx] = useState(0);
  const [deletingOfferId, setDeletingOfferId] = useState<string>('');

  const eligible = useMemo(() => eligibleUniversities(universities), [universities]);

  const eligibleFiltered = useMemo(() => {
    const q = universitySearch.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((u) => {
      const id = String(u.id || '').toLowerCase();
      const name = String(u.name || '').toLowerCase();
      return id.includes(q) || name.includes(q) || `${name} (${id})`.includes(q);
    });
  }, [eligible, universitySearch]);

  const selectedUniversityLabel = useMemo(() => {
    const id = String(selected || '').trim();
    if (!id) return '— Select a university —';
    const u = eligible.find((x) => x.id === id);
    return u ? `${u.name} (${u.id})` : id;
  }, [eligible, selected]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!universityOpen) return;
      const el = uniComboRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setUniversityOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [universityOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!universityOpen) return;
      if (e.key === 'Escape') setUniversityOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [universityOpen]);

  const universityNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of universities) m.set(u.id, u.name);
    return m;
  }, [universities]);

  const refreshUniversities = async () => {
    const all = await listUniversities();
    // Auto-seed any universities from the mobile app list that don't exist in the DB yet
    const existingIds = new Set(all.map((u) => u.id));
    const missing = APP_UNIVERSITIES.filter((u) => !existingIds.has(u.id));
    if (missing.length > 0) {
      for (const u of missing) {
        try {
          await upsertUniversity({
            id: u.id,
            name: u.name,
            api_endpoint: null,
            login_method: 'manual',
            request_method: 'GET',
            required_params: [],
          });
        } catch {
          // Ignore individual seed failures
        }
      }
      // Re-fetch after seeding
      const updated = await listUniversities();
      setUniversities(updated);
    } else {
      setUniversities(all);
    }
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

  const filteredHistory = useMemo(() => {
    const qTop = searchQuery.trim();
    const qLocal = offersSearch.trim();
    const uni = offersUni.trim();
    return history.filter((h) => {
      if (uni && h.university_id !== uni) return false;
      if (qTop) {
        const ok = matchesAdminSearch(
          qTop,
          h.university_id,
          universityNameById.get(h.university_id) ?? '',
          h.semester_label,
          h.admin_note ?? '',
          h.official_url ?? '',
        );
        if (!ok) return false;
      }
      if (qLocal) {
        const ok = matchesAdminSearch(
          qLocal,
          h.university_id,
          universityNameById.get(h.university_id) ?? '',
          h.semester_label,
          h.admin_note ?? '',
          h.official_url ?? '',
        );
        if (!ok) return false;
      }
      return true;
    });
  }, [history, offersSearch, offersUni, searchQuery, universityNameById]);

  const offerUniOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) set.add(h.university_id);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [history]);

  const publish = async () => {
    setErr('');
    setOkMsg('');
    if (!selected) {
      setErr('Select a university first (UiTM is excluded; it keeps the portal calendar).');
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

      const rows: AdminCalendarOfferInsert[] = [{
        university_id: selected,
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
      }];

      const inserted = await insertUniversityCalendarOffers(rows);
      const uniName = universityNameById.get(selected) ?? selected;
      setOkMsg(`Published calendar for ${uniName}. Students from this university will automatically receive the updated calendar.`);
      setSelected('');
      if (fileRef.current) fileRef.current.value = '';
      // Merge returned rows first so the UI updates immediately (list fetch can lag slightly on some setups).
      if (inserted.length > 0) {
        setHistory((prev) => {
          const byId = new Map<string, AdminCalendarOfferRow>();
          for (const row of inserted) byId.set(row.id, row);
          for (const row of prev) {
            if (!byId.has(row.id)) byId.set(row.id, row);
          }
          return Array.from(byId.values())
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, 150);
        });
      }
      clearSearch();
      await refreshHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  };

  const applyExtractedCandidate = (d: {
    program_level?: string;
    semester_label?: string;
    start_date?: string;
    end_date?: string;
    total_weeks?: number;
    break_start_date?: string | null;
    break_end_date?: string | null;
    periods?: Array<{ type: string; label: string; startDate: string; endDate: string }>;
  }) => {
    if (d.semester_label) setSemesterLabel(d.semester_label);
    if (d.start_date) setStartDate(d.start_date);
    if (d.end_date) setEndDate(d.end_date);
    if (d.total_weeks) setTotalWeeks(String(d.total_weeks));
    if (d.break_start_date) setBreakStart(String(d.break_start_date));
    if (d.break_end_date) setBreakEnd(String(d.break_end_date));
    if (d.periods && Array.isArray(d.periods) && d.periods.length > 0) {
      setPeriodsJson(JSON.stringify(d.periods, null, 2));
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Academic calendar updates</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Configure semester dates for each university. Students will automatically receive the calendar for their university.
          UiTM students use the portal calendar (HEA) and are excluded.
          {searchQuery.trim() ? (
            <span className="mt-1 block text-xs font-bold text-brand-600 dark:text-brand-400">
              History table filtered by the top search bar.
            </span>
          ) : null}
        </div>
      </MotionSection>

      <MotionPanel className="mt-6">
        <Card>
          <CardHeader className="items-center py-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="leading-none">Publish new offer</CardTitle>
              <button
                type="button"
                onClick={() => setPublishOpen((v) => !v)}
                className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black leading-none text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                {publishOpen ? 'Collapse' : 'Expand'}
              </button>
            </div>
            <CardDescription>
              Select a university from the dropdown and configure its semester dates. Each university has its own calendar.
            </CardDescription>
          </CardHeader>
          {publishOpen ? <CardContent className="space-y-5">
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
              <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">University</div>
              <div ref={uniComboRef} className="relative">
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={universityOpen}
                  onClick={() => {
                    setUniversityOpen((v) => !v);
                    if (!universityOpen) setUniversitySearch('');
                  }}
                  className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <span className="truncate">{selectedUniversityLabel}</span>
                  <span className="text-slate-400">▾</span>
                </button>

                {universityOpen ? (
                  <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
                    <div className="p-2">
                      <TextInput
                        autoFocus
                        value={universitySearch}
                        onChange={(e) => setUniversitySearch(e.target.value)}
                        placeholder="Search university (type name or id, e.g. UTM)"
                      />
                    </div>
                    <div role="listbox" className="max-h-64 overflow-auto p-1">
                      {eligibleFiltered.map((u) => {
                        const active = u.id === selected;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            onClick={() => {
                              setSelected(u.id);
                              setUniversityOpen(false);
                              setUniversitySearch('');
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                              active
                                ? 'bg-brand-600 text-white'
                                : 'text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <span className="truncate">
                              {u.name} ({u.id})
                            </span>
                            {active ? <span className="text-xs font-black">Selected</span> : null}
                          </button>
                        );
                      })}
                      {eligible.length > 0 && eligibleFiltered.length === 0 && universitySearch.trim() ? (
                        <div className="px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400">No matches.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
              {eligible.length === 0 && universities.length === 0 ? (
                <p className="mt-2 text-sm font-semibold text-slate-500">
                  No universities found. They will be auto-seeded on page reload.
                </p>
              ) : null}
            </div>

            {/* ─── Auto-Extract from Website ─── */}
            <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  Auto-Extract from Website
                </span>
              </div>
              <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                Paste the official academic calendar URL. The system will scrape the page and use AI to extract semester dates, teaching weeks, and period timelines — just like UiTM's calendar flow.
              </p>
              {extractErr ? (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
                  {extractErr}
                </div>
              ) : null}
              {extractOk ? (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-100">
                  {extractOk}
                </div>
              ) : null}
              <div className="flex gap-2">
                <TextInput
                  value={extractUrl}
                  onChange={(e) => setExtractUrl(e.target.value)}
                  placeholder="https://www.university.edu.my/academic-calendar"
                  className="flex-1"
                />
                <Button
                  type="button"
                  disabled={extracting || !extractUrl.trim()}
                  onClick={async () => {
                    setExtractErr('');
                    setExtractOk('');
                    setExtractCandidates([]);
                    setExtractCandidateIdx(0);
                    const url = extractUrl.trim();
                    if (!url) { setExtractErr('Please enter a URL.'); return; }
                    setExtracting(true);
                    try {
                      const res = await extractCalendarFromUrl(url);
                      const d = res.extracted;
                      const candidates = Array.isArray((d as any)?.candidates) ? ((d as any).candidates as any[]) : [];
                      if (candidates.length > 0) {
                        setExtractCandidates(candidates as any);
                        setExtractCandidateIdx(0);
                        applyExtractedCandidate(candidates[0] as any);
                        const lvl = String((candidates[0] as any)?.program_level ?? '').trim();
                        setExtractOk(
                          `✅ Extracted ${candidates.length} program calendar(s). Auto-filled: ${lvl ? `${lvl} — ` : ''}${String((candidates[0] as any)?.semester_label ?? 'Calendar data')}. Review then publish.`
                        );
                      } else {
                        // Backward-compat: accept legacy single-calendar extraction shape (pre-candidates)
                        const hasLegacy =
                          Boolean((d as any)?.semester_label) ||
                          Boolean((d as any)?.start_date) ||
                          Boolean((d as any)?.end_date) ||
                          Boolean((d as any)?.total_weeks) ||
                          Array.isArray((d as any)?.periods);
                        if (hasLegacy) {
                          const one = {
                            program_level: String((d as any)?.program_level ?? 'General'),
                            semester_label: (d as any)?.semester_label,
                            start_date: (d as any)?.start_date,
                            end_date: (d as any)?.end_date,
                            total_weeks: (d as any)?.total_weeks,
                            break_start_date: (d as any)?.break_start_date ?? null,
                            break_end_date: (d as any)?.break_end_date ?? null,
                            periods: Array.isArray((d as any)?.periods) ? (d as any)?.periods : [],
                          };
                          setExtractCandidates([one]);
                          setExtractCandidateIdx(0);
                          applyExtractedCandidate(one as any);
                          setExtractOk(
                            `✅ Extracted: ${String(one.semester_label ?? 'Calendar data')}. Review the auto-filled fields below, then publish.`
                          );
                        } else {
                          setExtractErr('AI extraction succeeded but returned no candidates. Enter details manually.');
                        }
                      }
                      setOfficialUrl(url);
                    } catch (e) {
                      setExtractErr(e instanceof Error ? e.message : 'Extraction failed. Enter details manually.');
                    } finally {
                      setExtracting(false);
                    }
                  }}
                  className="shrink-0 whitespace-nowrap"
                >
                  {extracting ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Extracting…
                    </span>
                  ) : (
                    '🔍 Extract & Auto-Fill'
                  )}
                </Button>
              </div>
              {extractCandidates.length > 1 ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Label className="block">
                    <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      Program level
                    </span>
                    <select
                      value={String(extractCandidateIdx)}
                      onChange={(e) => {
                        const idx = Math.max(0, Math.min(extractCandidates.length - 1, Number(e.target.value) || 0));
                        setExtractCandidateIdx(idx);
                        applyExtractedCandidate(extractCandidates[idx]);
                      }}
                      className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {extractCandidates.map((c, idx) => {
                        const lvl = String(c.program_level ?? '').trim() || `Candidate ${idx + 1}`;
                        const label = String(c.semester_label ?? '').trim();
                        return (
                          <option key={`${lvl}-${idx}`} value={String(idx)}>
                            {lvl}{label ? ` — ${label}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </Label>
                </div>
              ) : null}
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
          </CardContent> : null}
        </Card>
      </MotionPanel>

      <MotionSection className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">Existing offers</div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Newest first. Each row shows the university, semester span, and a visual timeline (phases from periods JSON when present).
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setOffersUni('');
                setOffersSearch('');
              }}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setOffersOpen((v) => !v)}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-900 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              {offersOpen ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
      </MotionSection>

      {offersOpen ? (
        <>
          <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  University
                </span>
                <select
                  value={offersUni}
                  onChange={(e) => setOffersUni(e.target.value)}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="">All</option>
                  {offerUniOptions.map((u) => (
                    <option key={u} value={u}>
                      {universityNameById.get(u) ?? u} ({u})
                    </option>
                  ))}
                </select>
              </Label>
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Search
                </span>
                <TextInput
                  value={offersSearch}
                  onChange={(e) => setOffersSearch(e.target.value)}
                  placeholder="Search semester, note, url…"
                />
              </Label>
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing <span className="font-black">{filteredHistory.length}</span> offer(s)
              {searchQuery.trim() ? ' (also filtered by top search bar)' : ''}.
            </div>
          </div>

          {/* key remounts the stagger container when rows change so new items are not stuck at opacity:0 (parent used whileInView once:true). */}
          <MotionStagger key={history.map((h) => h.id).join('|')} className="mt-4 space-y-3">
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
                    {h.admin_note ? (
                      <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">{h.admin_note}</div>
                    ) : null}
                    <div className="flex flex-wrap gap-3 text-xs font-bold">
                      {h.official_url ? (
                        <a href={h.official_url} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400">
                          Link
                        </a>
                      ) : null}
                      {h.reference_pdf_url ? (
                        <a
                          href={h.reference_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-600 dark:text-brand-400"
                        >
                          PDF
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        disabled={Boolean(deletingOfferId)}
                        onClick={async () => {
                          const uni = universityNameById.get(h.university_id) ?? h.university_id;
                          const ok = window.confirm(
                            `Delete this offer?\n\n${uni}\n${h.semester_label}\n\nThis cannot be undone.`,
                          );
                          if (!ok) return;
                          setErr('');
                          setOkMsg('');
                          setDeletingOfferId(h.id);
                          try {
                            await deleteUniversityCalendarOffer(h.id);
                            await refreshHistory();
                            setOkMsg('Offer deleted.');
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : 'Delete failed');
                          } finally {
                            setDeletingOfferId('');
                          }
                        }}
                      >
                        {deletingOfferId === h.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </MotionStaggerItem>
            ))}
            {filteredHistory.length === 0 ? <div className="text-sm font-semibold text-slate-500">No offers yet.</div> : null}
          </MotionStagger>
        </>
      ) : null}
    </div>
  );
}
