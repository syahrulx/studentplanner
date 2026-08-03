import { useEffect, useMemo, useRef, useState } from "react";
import {
  extractCalendarFromUrl,
  extractCalendarFromPdf,
  extractCalendarFromImage,
  deleteExpiredAdminCalendarOffers,
  deleteUniversityCalendarOffer,
  insertUniversityCalendarOffers,
  listUniversities,
  listCampuses,
  listUniversityCalendarOffers,
  upsertUniversity,
  type AdminCalendarOfferRow,
  type AdminCalendarOfferInsert,
  type AdminCampusRow,
  type UniversityRow,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import { Button } from "../ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/Card";
import { Label, TextInput } from "../ui/Input";
import { matchesAdminSearch } from "../lib/adminSearch";
import { useAdminSearch } from "../state/AdminSearchContext";
import { MotionPanel, MotionSection } from "../ui/motion";
import { AcademicCalendarOfferGraphic } from "../components/AcademicCalendarOfferGraphic";

const BUCKET = "academic-calendar-refs";

/**
 * Must match the UNIVERSITIES list in gradeup-mobile/src/lib/universities.ts.
 * UiTM is excluded here because it uses the portal calendar (HEA).
 */
const APP_UNIVERSITIES: { id: string; name: string }[] = [
  { id: "um", name: "Universiti Malaya" },
  { id: "utm", name: "Universiti Teknologi Malaysia" },
  { id: "ukm", name: "Universiti Kebangsaan Malaysia" },
  { id: "upm", name: "Universiti Putra Malaysia" },
  { id: "usm", name: "Universiti Sains Malaysia" },
  { id: "uiam", name: "Universiti Islam Antarabangsa Malaysia" },
  { id: "unimas", name: "Universiti Malaysia Sarawak" },
  { id: "ums", name: "Universiti Malaysia Sabah" },
  { id: "upsi", name: "Universiti Pendidikan Sultan Idris" },
  { id: "uthm", name: "Universiti Tun Hussein Onn Malaysia" },
  { id: "umt", name: "Universiti Malaysia Terengganu" },
  { id: "unimap", name: "Universiti Malaysia Perlis" },
  { id: "ump", name: "Universiti Malaysia Pahang Al-Sultan Abdullah" },
  { id: "unisel", name: "Universiti Selangor" },
  { id: "mmu", name: "Multimedia University" },
  { id: "uniten", name: "Universiti Tenaga Nasional" },
  { id: "utp", name: "Universiti Teknologi PETRONAS" },
  { id: "taylors", name: "Taylor's University" },
  { id: "sunway", name: "Sunway University" },
  { id: "utem", name: "Universiti Teknikal Malaysia Melaka" },
];

function eligibleUniversities(list: UniversityRow[]): UniversityRow[] {
  return list
    .filter((u) => u.id !== "uitm")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function CalendarUpdatesRoute() {
  const { searchQuery, clearSearch } = useAdminSearch();
  const fileRef = useRef<HTMLInputElement>(null);
  const uniComboRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [allCampuses, setAllCampuses] = useState<AdminCampusRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [selectedCampus, setSelectedCampus] = useState<string>("");
  const [uniCampuses, setUniCampuses] = useState<AdminCampusRow[]>([]);
  const [universitySearch, setUniversitySearch] = useState("");
  const [universityOpen, setUniversityOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(true);
  const [offersOpen, setOffersOpen] = useState(true);
  const [offersSearch, setOffersSearch] = useState("");
  const [offersUni, setOffersUni] = useState("");
  const [offersAge, setOffersAge] = useState<"all" | "expired">("all");
  const [selectedExpiredOfferIds, setSelectedExpiredOfferIds] = useState<string[]>([]);
  const [selectAllExpiredAdminOffers, setSelectAllExpiredAdminOffers] = useState(false);
  const [openOfferGroups, setOpenOfferGroups] = useState<
    Record<string, boolean>
  >({});
  const [history, setHistory] = useState<AdminCalendarOfferRow[]>([]);
  const [semesterLabel, setSemesterLabel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalWeeks, setTotalWeeks] = useState("14");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [periodsJson, setPeriodsJson] = useState("");

  // ── Auto-extract state ──
  const [extractUrl, setExtractUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState("");
  const [extractOk, setExtractOk] = useState("");
  const [extractCandidates, setExtractCandidates] = useState<
    Array<{
      program_level?: string;
      campus_group?: string | null;
      campus_group_description?: string | null;
      semester_label?: string;
      start_date?: string;
      end_date?: string;
      total_weeks?: number;
      break_start_date?: string | null;
      break_end_date?: string | null;
      periods?: Array<{
        type: string;
        label: string;
        startDate: string;
        endDate: string;
      }>;
    }>
  >([]);
  const [extractCandidateIdx, setExtractCandidateIdx] = useState(0);
  const [deletingOfferId, setDeletingOfferId] = useState<string>("");
  const [deletingExpiredOffers, setDeletingExpiredOffers] = useState(false);

  // ── PDF extract state ──
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfExtractErr, setPdfExtractErr] = useState("");
  const [pdfExtractOk, setPdfExtractOk] = useState("");

  // ── Image extract state ──
  const imgFileRef = useRef<HTMLInputElement>(null);
  const [imgExtracting, setImgExtracting] = useState(false);
  const [imgExtractErr, setImgExtractErr] = useState("");
  const [imgExtractOk, setImgExtractOk] = useState("");

  const eligible = useMemo(
    () => eligibleUniversities(universities),
    [universities],
  );

  const eligibleFiltered = useMemo(() => {
    const q = universitySearch.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter((u) => {
      const id = String(u.id || "").toLowerCase();
      const name = String(u.name || "").toLowerCase();
      return (
        id.includes(q) || name.includes(q) || `${name} (${id})`.includes(q)
      );
    });
  }, [eligible, universitySearch]);

  const selectedUniversityLabel = useMemo(() => {
    const id = String(selected || "").trim();
    if (!id) return "— Select a university —";
    const u = eligible.find((x) => x.id === id);
    return u ? `${u.name} (${u.id})` : id;
  }, [eligible, selected]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!universityOpen) return;
      const el = uniComboRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target))
        setUniversityOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [universityOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!universityOpen) return;
      if (e.key === "Escape") setUniversityOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [universityOpen]);

  const universityNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of universities) m.set(u.id, u.name);
    return m;
  }, [universities]);

  const refreshUniversities = async () => {
    const [all, allCamps] = await Promise.all([
      listUniversities(),
      listCampuses(),
    ]);
    setAllCampuses(allCamps);
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
            login_method: "manual",
            request_method: "GET",
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
    // End-date ordering brings expired offers to the top, rather than hiding
    // them behind the newest 150 publication records.
    const items = await listUniversityCalendarOffers({ limit: 300, orderBy: "end_date", ascending: true });
    setHistory(items);
  };

  useEffect(() => {
    void (async () => {
      setErr("");
      try {
        await refreshUniversities();
        await refreshHistory();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) {
      setUniCampuses([]);
      setSelectedCampus("");
      return;
    }
    const camps = allCampuses.filter((c) => c.university_id === selected);
    setUniCampuses(camps);
    setSelectedCampus("");
  }, [selected, allCampuses]);

  const filteredHistory = useMemo(() => {
    const qTop = searchQuery.trim();
    const qLocal = offersSearch.trim();
    const uni = offersUni.trim();
    const today = new Date().toISOString().slice(0, 10);
    return history.filter((h) => {
      if (uni && h.university_id !== uni) return false;
      if (offersAge === "expired" && !(h.source === "admin" && h.start_date < today && h.end_date < today)) return false;
      if (qTop) {
        const ok = matchesAdminSearch(
          qTop,
          h.university_id,
          universityNameById.get(h.university_id) ?? "",
          h.semester_label,
          h.admin_note ?? "",
          h.official_url ?? "",
        );
        if (!ok) return false;
      }
      if (qLocal) {
        const ok = matchesAdminSearch(
          qLocal,
          h.university_id,
          universityNameById.get(h.university_id) ?? "",
          h.semester_label,
          h.admin_note ?? "",
          h.official_url ?? "",
        );
        if (!ok) return false;
      }
      return true;
    }).sort((a, b) => a.end_date.localeCompare(b.end_date) || a.start_date.localeCompare(b.start_date));
  }, [history, offersAge, offersSearch, offersUni, searchQuery, universityNameById]);

  const expiredAdminOffers = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return history.filter((h) => h.source === "admin" && h.start_date < today && h.end_date < today);
  }, [history]);

  const expiredAdminOfferIds = useMemo(
    () => new Set(expiredAdminOffers.map((offer) => offer.id)),
    [expiredAdminOffers],
  );

  useEffect(() => {
    setSelectedExpiredOfferIds((ids) => ids.filter((id) => expiredAdminOfferIds.has(id)));
  }, [expiredAdminOfferIds]);

  const allExpiredAdminOffersSelected = selectAllExpiredAdminOffers || (expiredAdminOffers.length > 0 && expiredAdminOffers.every((offer) => selectedExpiredOfferIds.includes(offer.id)));

  const toggleExpiredAdminOffer = (id: string) => {
    setSelectAllExpiredAdminOffers(false);
    setSelectedExpiredOfferIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  };

  const toggleAllExpiredAdminOffers = () => {
    const nextSelected = !allExpiredAdminOffersSelected;
    setSelectAllExpiredAdminOffers(nextSelected);
    setSelectedExpiredOfferIds(nextSelected ? expiredAdminOffers.map((offer) => offer.id) : []);
  };

  const deleteSelectedExpiredAdminOffers = async () => {
    if (!selectedExpiredOfferIds.length && !selectAllExpiredAdminOffers) return;
    const count = selectedExpiredOfferIds.length;
    const ok = window.confirm(
      selectAllExpiredAdminOffers
        ? "Delete every old academic calendar offer?\n\nThis includes expired offers outside the currently loaded list. Only admin offers where both the start and end date have passed will be removed. This cannot be undone."
        : `Delete ${count} old academic calendar offer${count === 1 ? "" : "s"}?\n\nOnly admin offers where both the start and end date have passed will be removed. This cannot be undone.`,
    );
    if (!ok) return;
    setErr("");
    setOkMsg("");
    setDeletingExpiredOffers(true);
    try {
      const deletedCount = await deleteExpiredAdminCalendarOffers(selectedExpiredOfferIds, selectAllExpiredAdminOffers);
      setSelectedExpiredOfferIds([]);
      setSelectAllExpiredAdminOffers(false);
      await refreshHistory();
      setOkMsg(`${deletedCount} old academic calendar offer${deletedCount === 1 ? "" : "s"} deleted.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete old academic calendars");
    } finally {
      setDeletingExpiredOffers(false);
    }
  };

  const offerUniOptions = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) set.add(h.university_id);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [history]);

  const groupedAdminHistory = useMemo(() => {
    const map = new Map<string, AdminCalendarOfferRow[]>();
    for (const row of filteredHistory.filter(h => h.source !== 'crowdsourced')) {
      const k = row.university_id || 'unknown';
      const arr = map.get(k);
      if (arr) arr.push(row);
      else map.set(k, [row]);
    }
    return Array.from(map.entries()).map(([universityId, offers]) => ({
      universityId,
      universityName: universityNameById.get(universityId) ?? universityId,
      offers,
    }));
  }, [filteredHistory, universityNameById]);

  const publish = async () => {
    setErr("");
    setOkMsg("");
    if (!selected) {
      setErr(
        "Select a university first (UiTM is excluded; it keeps the portal calendar).",
      );
      return;
    }
    const campId = selectedCampus.trim() || null;
    const label = semesterLabel.trim();
    const sd = startDate.trim().slice(0, 10);
    const ed = endDate.trim().slice(0, 10);
    if (!label) {
      setErr("Semester label is required.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
      setErr("Start and end dates must be valid YYYY-MM-DD.");
      return;
    }
    if (sd > ed) {
      setErr("Start date must be on or before end date.");
      return;
    }
    const tw = Math.max(1, Math.min(52, Number(totalWeeks) || 14));
    let periods: unknown | null = null;
    const pj = periodsJson.trim();
    if (pj) {
      try {
        const parsed = JSON.parse(pj) as unknown;
        if (!Array.isArray(parsed)) {
          setErr("Periods JSON must be a JSON array (or leave empty).");
          return;
        }
        periods = parsed;
      } catch {
        setErr("Periods JSON is not valid JSON.");
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
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upErr) throw new Error(upErr.message);
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        pdfUrl = pub.publicUrl;
      }

      const url = officialUrl.trim() || null;
      const note = adminNote.trim() || null;

      const rows: AdminCalendarOfferInsert[] = [
        {
          university_id: selected,
          campus_id: campId,
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
        },
      ];

      const inserted = await insertUniversityCalendarOffers(rows);
      const uniName = universityNameById.get(selected) ?? selected;
      setOkMsg(
        `Published calendar for ${uniName}. Students from this university will automatically receive the updated calendar.`,
      );
      setSelected("");
      if (fileRef.current) fileRef.current.value = "";
      // Merge returned rows first so the UI updates immediately (list fetch can lag slightly on some setups).
      if (inserted.length > 0) {
        setHistory((prev) => {
          const byId = new Map<string, AdminCalendarOfferRow>();
          for (const row of inserted) byId.set(row.id, row);
          for (const row of prev) {
            if (!byId.has(row.id)) byId.set(row.id, row);
          }
          return Array.from(byId.values())
            .sort((a, b) =>
              String(b.created_at).localeCompare(String(a.created_at)),
            )
            .slice(0, 150);
        });
      }
      clearSearch();
      await refreshHistory();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const applyExtractedCandidate = (d: {
    program_level?: string;
    campus_group?: string | null;
    campus_group_description?: string | null;
    semester_label?: string;
    start_date?: string;
    end_date?: string;
    total_weeks?: number;
    break_start_date?: string | null;
    break_end_date?: string | null;
    periods?: Array<{
      type: string;
      label: string;
      startDate: string;
      endDate: string;
    }>;
  }) => {
    if (d.semester_label) {
      let finalLabel = d.semester_label;
      const group = d.campus_group ? String(d.campus_group).trim() : "";
      const prog = d.program_level ? String(d.program_level).trim() : "";
      
      // If there are multiple candidates, ensure the label is unique 
      // by prepending the institute or program level.
      if (group) {
        finalLabel = `${group} - ${finalLabel}`;
      } else if (prog && prog.toLowerCase() !== "general") {
        finalLabel = `${prog} - ${finalLabel}`;
      }
      
      setSemesterLabel(finalLabel);
    }
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
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
          Academic calendar updates
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Configure semester dates for each university. Students will
          automatically receive the calendar for their university. UiTM students
          use the portal calendar (HEA) and are excluded.
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
                {publishOpen ? "Collapse" : "Expand"}
              </button>
            </div>
            <CardDescription>
              Select a university from the dropdown and configure its semester
              dates. Each university has its own calendar.
            </CardDescription>
          </CardHeader>
          {publishOpen ? (
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
                <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  University
                </div>
                <div ref={uniComboRef} className="relative">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={universityOpen}
                    onClick={() => {
                      setUniversityOpen((v) => !v);
                      if (!universityOpen) setUniversitySearch("");
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
                      <div
                        role="listbox"
                        className="max-h-64 overflow-auto p-1"
                      >
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
                                setUniversitySearch("");
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                                active
                                  ? "bg-brand-600 text-white"
                                  : "text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/50"
                              }`}
                            >
                              <span className="truncate">
                                {u.name} ({u.id})
                              </span>
                              {active ? (
                                <span className="text-xs font-black">
                                  Selected
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                        {eligible.length > 0 &&
                        eligibleFiltered.length === 0 &&
                        universitySearch.trim() ? (
                          <div className="px-3 py-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                            No matches.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
                {eligible.length === 0 && universities.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    No universities found. They will be auto-seeded on page
                    reload.
                  </p>
                ) : null}
              </div>

              {uniCampuses.length > 0 ? (
                <div>
                  <div className="mb-1 text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Campus (Optional)
                  </div>
                  <select
                    value={selectedCampus}
                    onChange={(e) => setSelectedCampus(e.target.value)}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="">All Campuses</option>
                    {uniCampuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* ─── Auto-Extract from Website ─── */}
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">🤖</span>
                  <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Auto-Extract from Website
                  </span>
                </div>
                <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Paste the official academic calendar URL. The system will
                  scrape the page and use AI to extract semester dates, teaching
                  weeks, and period timelines — just like UiTM's calendar flow.
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
                      setExtractErr("");
                      setExtractOk("");
                      setExtractCandidates([]);
                      setExtractCandidateIdx(0);
                      const url = extractUrl.trim();
                      if (!url) {
                        setExtractErr("Please enter a URL.");
                        return;
                      }
                      setExtracting(true);
                      try {
                        const res = await extractCalendarFromUrl(url);
                        const d = res.extracted;
                        const candidates = Array.isArray((d as any)?.candidates)
                          ? ((d as any).candidates as any[])
                          : [];
                        if (candidates.length > 0) {
                          setExtractCandidates(candidates as any);
                          setExtractCandidateIdx(0);
                          applyExtractedCandidate(candidates[0] as any);
                          const lvl = String(
                            (candidates[0] as any)?.program_level ?? "",
                          ).trim();
                          setExtractOk(
                            `✅ Extracted ${candidates.length} program calendar(s). Auto-filled: ${lvl ? `${lvl} — ` : ""}${String((candidates[0] as any)?.semester_label ?? "Calendar data")}. Review then publish.`,
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
                              program_level: String(
                                (d as any)?.program_level ?? "General",
                              ),
                              semester_label: (d as any)?.semester_label,
                              start_date: (d as any)?.start_date,
                              end_date: (d as any)?.end_date,
                              total_weeks: (d as any)?.total_weeks,
                              break_start_date:
                                (d as any)?.break_start_date ?? null,
                              break_end_date:
                                (d as any)?.break_end_date ?? null,
                              periods: Array.isArray((d as any)?.periods)
                                ? (d as any)?.periods
                                : [],
                            };
                            setExtractCandidates([one]);
                            setExtractCandidateIdx(0);
                            applyExtractedCandidate(one as any);
                            setExtractOk(
                              `✅ Extracted: ${String(one.semester_label ?? "Calendar data")}. Review the auto-filled fields below, then publish.`,
                            );
                          } else {
                            setExtractErr(
                              "AI extraction succeeded but returned no candidates. Enter details manually.",
                            );
                          }
                        }
                        setOfficialUrl(url);
                      } catch (e) {
                        setExtractErr(
                          e instanceof Error
                            ? e.message
                            : "Extraction failed. Enter details manually.",
                        );
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
                      "🔍 Extract & Auto-Fill"
                    )}
                  </Button>
                </div>
                {extractCandidates.length > 0 ? (
                  <div className="mt-3">
                    <Label className="block">
                      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        {extractCandidates.some(c => c.campus_group) ? 'Institute / Program' : 'Program level'}
                      </span>
                      <select
                        value={String(extractCandidateIdx)}
                        onChange={(e) => {
                          const idx = Math.max(
                            0,
                            Math.min(
                              extractCandidates.length - 1,
                              Number(e.target.value) || 0,
                            ),
                          );
                          setExtractCandidateIdx(idx);
                          applyExtractedCandidate(extractCandidates[idx]);
                        }}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      >
                        {extractCandidates.map((c, idx) => {
                          const lvl =
                            String(c.program_level ?? "").trim() ||
                            `Candidate ${idx + 1}`;
                          const label = String(c.semester_label ?? "").trim();
                          const group = c.campus_group ? String(c.campus_group).trim() : "";
                          const groupDesc = c.campus_group_description ? ` (${String(c.campus_group_description).trim()})` : "";
                          const parts = [group, lvl].filter(Boolean).join(" — ");
                          return (
                            <option key={`${lvl}-${idx}`} value={String(idx)}>
                              {parts}
                              {groupDesc}
                              {label ? ` • ${label}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </Label>
                    {extractCandidates[extractCandidateIdx]?.campus_group_description ? (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                        📍 <span className="font-black">{extractCandidates[extractCandidateIdx]?.campus_group}:</span>{" "}
                        {extractCandidates[extractCandidateIdx]?.campus_group_description}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Semester label
                  </span>
                  <TextInput
                    value={semesterLabel}
                    onChange={(e) => setSemesterLabel(e.target.value)}
                    placeholder="e.g. Semester 1 2025/2026"
                  />
                </Label>
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Total teaching weeks
                  </span>
                  <TextInput
                    value={totalWeeks}
                    onChange={(e) => setTotalWeeks(e.target.value)}
                    placeholder="14"
                    inputMode="numeric"
                  />
                </Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Start date
                  </span>
                  <TextInput
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </Label>
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    End date
                  </span>
                  <TextInput
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </Label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Break start (optional)
                  </span>
                  <TextInput
                    type="date"
                    value={breakStart}
                    onChange={(e) => setBreakStart(e.target.value)}
                  />
                </Label>
                <Label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Break end (optional)
                  </span>
                  <TextInput
                    type="date"
                    value={breakEnd}
                    onChange={(e) => setBreakEnd(e.target.value)}
                  />
                </Label>
              </div>

              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Official link (optional)
                </span>
                <TextInput
                  value={officialUrl}
                  onChange={(e) => setOfficialUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Label>

              {/* ─── PDF Upload + AI Extract ─── */}
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Upload PDF & Auto-Extract
                  </span>
                </div>
                <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Upload the university's academic calendar PDF. The system will
                  extract text and use AI to auto-fill semester dates, teaching
                  weeks, and period timelines.
                </p>
                {pdfExtractErr ? (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
                    {pdfExtractErr}
                  </div>
                ) : null}
                {pdfExtractOk ? (
                  <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-100">
                    {pdfExtractOk}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="block flex-1 text-sm font-semibold text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white dark:text-slate-200"
                  />
                  <Button
                    type="button"
                    disabled={pdfExtracting}
                    onClick={async () => {
                      setPdfExtractErr("");
                      setPdfExtractOk("");
                      const file = fileRef.current?.files?.[0];
                      if (!file || file.size === 0) {
                        setPdfExtractErr("Please choose a PDF file first.");
                        return;
                      }
                      if (!file.name.toLowerCase().endsWith(".pdf")) {
                        setPdfExtractErr("Only PDF files are supported.");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        setPdfExtractErr("PDF is too large (max 10 MB).");
                        return;
                      }
                      setPdfExtracting(true);
                      try {
                        // Read file as base64
                        const arrayBuf = await file.arrayBuffer();
                        const bytes = new Uint8Array(arrayBuf);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) {
                          binary += String.fromCharCode(bytes[i]);
                        }
                        const base64 = btoa(binary);

                        const res = await extractCalendarFromPdf(
                          base64,
                          file.name,
                        );
                        const d = res.extracted;
                        const candidates = Array.isArray((d as any)?.candidates)
                          ? ((d as any).candidates as any[])
                          : [];
                        if (candidates.length > 0) {
                          setExtractCandidates(candidates as any);
                          setExtractCandidateIdx(0);
                          applyExtractedCandidate(candidates[0] as any);
                          const lvl = String(
                            (candidates[0] as any)?.program_level ?? "",
                          ).trim();
                          setPdfExtractOk(
                            `✅ Extracted ${candidates.length} program calendar(s) from PDF. Auto-filled: ${lvl ? `${lvl} — ` : ""}${String((candidates[0] as any)?.semester_label ?? "Calendar data")}. Review then publish.`,
                          );
                        } else {
                          const hasLegacy =
                            Boolean((d as any)?.semester_label) ||
                            Boolean((d as any)?.start_date) ||
                            Boolean((d as any)?.end_date) ||
                            Boolean((d as any)?.total_weeks) ||
                            Array.isArray((d as any)?.periods);
                          if (hasLegacy) {
                            const one = {
                              program_level: String(
                                (d as any)?.program_level ?? "General",
                              ),
                              semester_label: (d as any)?.semester_label,
                              start_date: (d as any)?.start_date,
                              end_date: (d as any)?.end_date,
                              total_weeks: (d as any)?.total_weeks,
                              break_start_date:
                                (d as any)?.break_start_date ?? null,
                              break_end_date:
                                (d as any)?.break_end_date ?? null,
                              periods: Array.isArray((d as any)?.periods)
                                ? (d as any)?.periods
                                : [],
                            };
                            setExtractCandidates([one]);
                            setExtractCandidateIdx(0);
                            applyExtractedCandidate(one as any);
                            setPdfExtractOk(
                              `✅ Extracted from PDF: ${String(one.semester_label ?? "Calendar data")}. Review the auto-filled fields below, then publish.`,
                            );
                          } else {
                            setPdfExtractErr(
                              "AI extraction succeeded but returned no calendar data. Enter details manually.",
                            );
                          }
                        }
                      } catch (e) {
                        setPdfExtractErr(
                          e instanceof Error
                            ? e.message
                            : "PDF extraction failed. Enter details manually.",
                        );
                      } finally {
                        setPdfExtracting(false);
                      }
                    }}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {pdfExtracting ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Extracting from PDF…
                      </span>
                    ) : (
                      "📄 Extract & Auto-Fill from PDF"
                    )}
                  </Button>
                </div>
              </div>

              {/* ─── Image Upload + AI Extract ─── */}
              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">🖼️</span>
                  <span className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-300">
                    Upload Image & Auto-Extract
                  </span>
                </div>
                <p className="mb-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Upload a screenshot, photo, or scan of the academic calendar.
                  The system will use GPT-4o Vision to extract semester dates,
                  teaching weeks, and period timelines.
                </p>
                {imgExtractErr ? (
                  <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200">
                    {imgExtractErr}
                  </div>
                ) : null}
                {imgExtractOk ? (
                  <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/50 dark:text-emerald-100">
                    {imgExtractOk}
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={imgFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="block flex-1 text-sm font-semibold text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-500 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white dark:text-slate-200"
                  />
                  <Button
                    type="button"
                    disabled={imgExtracting}
                    onClick={async () => {
                      setImgExtractErr("");
                      setImgExtractOk("");
                      const file = imgFileRef.current?.files?.[0];
                      if (!file || file.size === 0) {
                        setImgExtractErr("Please choose an image file first.");
                        return;
                      }
                      if (!file.type.startsWith("image/")) {
                        setImgExtractErr("Only image files are supported.");
                        return;
                      }
                      if (file.size > 10 * 1024 * 1024) {
                        setImgExtractErr("Image is too large (max 10 MB).");
                        return;
                      }
                      setImgExtracting(true);
                      try {
                        const arrayBuf = await file.arrayBuffer();
                        const bytes = new Uint8Array(arrayBuf);
                        let binary = "";
                        for (let i = 0; i < bytes.length; i++) {
                          binary += String.fromCharCode(bytes[i]);
                        }
                        const base64 = btoa(binary);

                        const res = await extractCalendarFromImage(
                          `data:${file.type};base64,${base64}`,
                          file.name,
                        );
                        const d = res.extracted;
                        const candidates = Array.isArray((d as any)?.candidates)
                          ? ((d as any).candidates as any[])
                          : [];
                        if (candidates.length > 0) {
                          setExtractCandidates(candidates as any);
                          setExtractCandidateIdx(0);
                          applyExtractedCandidate(candidates[0] as any);
                          const lvl = String(
                            (candidates[0] as any)?.program_level ?? "",
                          ).trim();
                          setImgExtractOk(
                            `✅ Extracted ${candidates.length} program calendar(s) from image. Auto-filled: ${lvl ? `${lvl} — ` : ""}${String((candidates[0] as any)?.semester_label ?? "Calendar data")}. Review then publish.`,
                          );
                        } else {
                          const hasLegacy =
                            Boolean((d as any)?.semester_label) ||
                            Boolean((d as any)?.start_date) ||
                            Boolean((d as any)?.end_date) ||
                            Boolean((d as any)?.total_weeks) ||
                            Array.isArray((d as any)?.periods);
                          if (hasLegacy) {
                            const one = {
                              program_level: String(
                                (d as any)?.program_level ?? "General",
                              ),
                              semester_label: (d as any)?.semester_label,
                              start_date: (d as any)?.start_date,
                              end_date: (d as any)?.end_date,
                              total_weeks: (d as any)?.total_weeks,
                              break_start_date:
                                (d as any)?.break_start_date ?? null,
                              break_end_date:
                                (d as any)?.break_end_date ?? null,
                              periods: Array.isArray((d as any)?.periods)
                                ? (d as any)?.periods
                                : [],
                            };
                            setExtractCandidates([one]);
                            setExtractCandidateIdx(0);
                            applyExtractedCandidate(one as any);
                            setImgExtractOk(
                              `✅ Extracted from image: ${String(one.semester_label ?? "Calendar data")}. Review the auto-filled fields below, then publish.`,
                            );
                          } else {
                            setImgExtractErr(
                              "AI extraction succeeded but returned no calendar data. Enter details manually.",
                            );
                          }
                        }
                      } catch (e) {
                        setImgExtractErr(
                          e instanceof Error
                            ? e.message
                            : "Image extraction failed. Enter details manually.",
                        );
                      } finally {
                        setImgExtracting(false);
                      }
                    }}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {imgExtracting ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Extracting…
                      </span>
                    ) : (
                      "🖼️ Extract & Auto-Fill from Image"
                    )}
                  </Button>
                </div>
              </div>

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

              <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50">
                <summary className="cursor-pointer text-sm font-black text-slate-700 dark:text-slate-200">
                  Advanced timeline data
                </summary>
                <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Usually not needed. URL, PDF and image extraction fill the student-facing timeline automatically. Keep this only for recovery or a technical correction.
                </p>
                <Label className="mt-3 block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    Timeline JSON (optional)
                  </span>
                  <textarea
                    value={periodsJson}
                    onChange={(e) => setPeriodsJson(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    placeholder='[{"type":"lecture","label":"…","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]'
                  />
                </Label>
              </details>

              <Button
                type="button"
                disabled={busy}
                onClick={() => void publish()}
                className="w-full sm:w-auto"
              >
                {busy ? "Publishing…" : "Publish offers"}
              </Button>
            </CardContent>
          ) : null}
        </Card>
      </MotionPanel>

      <MotionSection className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-black text-slate-900 dark:text-slate-100">
              Existing offers
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
              Ordered by calendar end date. Each row shows the university, semester span, and a
              visual timeline (calendar phases are shown when available).
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => {
                setOffersUni("");
                setOffersSearch("");
                setOffersAge("all");
                setSelectedExpiredOfferIds([]);
                setSelectAllExpiredAdminOffers(false);
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
              {offersOpen ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
      </MotionSection>

      {offersOpen ? (
        <>
          <div className="mt-4 rounded-3xl border border-slate-100 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-950/30">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <Label className="block">
                <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Calendar status
                </span>
                <select
                  value={offersAge}
                  onChange={(e) => setOffersAge(e.target.value as "all" | "expired")}
                  className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="all">All admin offers</option>
                  <option value="expired">Old academic calendars</option>
                </select>
              </Label>
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Showing{" "}
              <span className="font-black">{filteredHistory.length}</span>{" "}
              offer(s)
              {searchQuery.trim() ? " (also filtered by top search bar)" : ""}.
              {expiredAdminOffers.length ? ` ${expiredAdminOffers.length} old academic calendar${expiredAdminOffers.length === 1 ? "" : "s"} can be cleaned up.` : ""}
            </div>
          </div>

          {expiredAdminOffers.length ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/30">
              <label className="inline-flex cursor-pointer items-center gap-3 text-sm font-bold text-amber-950 dark:text-amber-100">
                <input
                  type="checkbox"
                  checked={allExpiredAdminOffersSelected}
                  onChange={toggleAllExpiredAdminOffers}
                  disabled={deletingExpiredOffers}
                />
                <span>Select all old academic calendars (including unloaded offers)</span>
              </label>
              <button
                type="button"
                onClick={() => void deleteSelectedExpiredAdminOffers()}
                disabled={(selectedExpiredOfferIds.length === 0 && !selectAllExpiredAdminOffers) || deletingExpiredOffers}
                className="h-10 rounded-xl bg-red-600 px-4 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingExpiredOffers ? "Deleting…" : selectAllExpiredAdminOffers ? "Delete all old calendars" : `Delete selected (${selectedExpiredOfferIds.length})`}
              </button>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {groupedAdminHistory.map((group) => (
              <div key={group.universityId}>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenOfferGroups((prev) => ({
                        ...prev,
                        [group.universityId]: !prev[group.universityId],
                      }))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-left dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-black text-slate-900 dark:text-slate-100">
                        {group.universityName}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {group.offers.length} offer(s)
                        </div>
                        <div className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          {openOfferGroups[group.universityId]
                            ? "Hide"
                            : "Show"}
                        </div>
                      </div>
                    </div>
                  </button>

                  {(openOfferGroups[group.universityId]
                    ? group.offers
                    : []
                  ).map((h) => (
                    <Card key={h.id}>
                      <CardContent className="space-y-4 py-4">
                        {h.source === "admin" && h.start_date < new Date().toISOString().slice(0, 10) && h.end_date < new Date().toISOString().slice(0, 10) ? (
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-black text-amber-800 dark:text-amber-200">
                            <input
                              type="checkbox"
                              checked={selectedExpiredOfferIds.includes(h.id)}
                              onChange={() => toggleExpiredAdminOffer(h.id)}
                              disabled={deletingExpiredOffers}
                            />
                            <span>Old calendar · {h.start_date} to {h.end_date}</span>
                          </label>
                        ) : null}
                        <AcademicCalendarOfferGraphic
                          offer={h}
                          universityName={
                            h.campus_id
                              ? `${group.universityName} - ${allCampuses.find((c) => c.id === h.campus_id)?.name || "Unknown Campus"}`
                              : `${group.universityName} (All Campuses)`
                          }
                        />
                        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Published {new Date(h.created_at).toLocaleString()}
                          </div>
                          {h.source === "crowdsourced" ? (
                            <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              Crowdsourced User Submission
                            </span>
                          ) : (
                            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                              Admin Verified
                            </span>
                          )}
                        </div>
                        {h.admin_note ? (
                          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {h.admin_note}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-3 text-xs font-bold">
                          {h.official_url ? (
                            <a
                              href={h.official_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 dark:text-brand-400"
                            >
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
                            disabled={Boolean(deletingOfferId) || deletingExpiredOffers}
                            onClick={async () => {
                              const uni =
                                universityNameById.get(h.university_id) ??
                                h.university_id;
                              const ok = window.confirm(
                                `Delete this offer?\n\n${uni}\n${h.semester_label}\n\nThis cannot be undone.`,
                              );
                              if (!ok) return;
                              setErr("");
                              setOkMsg("");
                              setDeletingOfferId(h.id);
                              try {
                                await deleteUniversityCalendarOffer(h.id);
                                await refreshHistory();
                                setOkMsg("Offer deleted.");
                              } catch (e) {
                                setErr(
                                  e instanceof Error
                                    ? e.message
                                    : "Delete failed",
                                );
                              } finally {
                                setDeletingOfferId("");
                              }
                            }}
                          >
                            {deletingOfferId === h.id ? "Deleting…" : "Delete"}
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
            {groupedAdminHistory.length === 0 ? (
              <div className="text-sm font-semibold text-slate-500">
                No admin offers yet.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
