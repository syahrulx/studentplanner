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
import { TextInput, Select, Textarea } from "../ui/Input";
import { Chip, EmptyState, FactGrid, Notice, PageHeader, Panel, Pill, PillGroup } from "../ui/page";
import { matchesAdminSearch } from "../lib/adminSearch";
import { useAdminSearch } from "../state/AdminSearchContext";
import { AcademicCalendarOfferGraphic, type CalendarGraphicOffer } from "../components/AcademicCalendarOfferGraphic";
import { useSafeActionDialog } from "../components/SafeActionDialog";
import { duplicateRecordIds, normaliseRecordName } from "../lib/dataQuality";
import { CleanupBox, Field, SourceCard, Spinner } from "../components/calendars/calendarUi";
import { BTN_DANGER, BTN_DANGER_SOFT, CHECKBOX, LINK_SM } from "../components/calendars/calendarStyles";

const BUCKET = "academic-calendar-refs";

/**
 * Must match the UNIVERSITIES list in gradeup-mobile/src/lib/universities.ts.
 * UiTM is excluded here because it uses the portal calendar (HEA).
 */
const APP_UNIVERSITIES: { id: string; name: string }[] = [
  { id: "um", name: "Universiti Malaya" },
  { id: "utm", name: "Universiti Teknologi Malaysia" },
  { id: "ukm", name: "Universiti Kebangsaan Malaysia" },
  { id: "uts", name: "University of Technology Sarawak" },
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
  { id: "usas", name: "Universiti Sultan Azlan Shah" },
  { id: "micp", name: "MAHSA International College (Penang)" },
];

function eligibleUniversities(list: UniversityRow[]): UniversityRow[] {
  return list
    .filter((u) => u.id !== "uitm")
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Timeline period builder ────────────────────────────────────────────────
// Replaces hand-typed JSON as the primary way an admin enters the semester
// timeline. This table (via insertUniversityCalendarOffers) publishes
// directly to every enrolled student's academic calendar with no review
// step, so a malformed or mistyped raw-JSON entry was a real risk to real
// user data. This component is a thin structured view over the exact same
// `periodsJson` string state the raw JSON box (still available below, for
// power users / recovery) already reads and writes — same shape in, same
// shape out, so publish()'s existing parse/validate logic needs no changes.

type PeriodRow = { type: string; label: string; startDate: string; endDate: string };

const PERIOD_TYPES: { value: string; label: string }[] = [
  { value: "orientation", label: "Orientation" },
  { value: "registration", label: "Registration" },
  { value: "lecture", label: "Lecture" },
  { value: "test", label: "Test" },
  { value: "revision", label: "Revision" },
  { value: "exam", label: "Exam" },
  { value: "break", label: "Break" },
  { value: "special_break", label: "Special Break" },
  { value: "holiday", label: "Holiday" },
  { value: "industrial_training", label: "Industrial Training" },
  { value: "other", label: "Other" },
];

function periodTypeLabel(type: string): string {
  return PERIOD_TYPES.find((t) => t.value === type)?.label ?? type;
}

function parsePeriodsJson(json: string): PeriodRow[] {
  const trimmed = json.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .map((p) => ({
        type: String(p.type ?? "other"),
        label: String(p.label ?? ""),
        startDate: String(p.startDate ?? "").slice(0, 10),
        endDate: String(p.endDate ?? "").slice(0, 10),
      }))
      // Draft rows are UI scaffolding, never publishable periods.
      .filter((p) => Boolean(p.label || p.startDate || p.endDate));
  } catch {
    return [];
  }
}

function PeriodListEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (json: string) => void;
}) {
  const rows = useMemo(() => parsePeriodsJson(value), [value]);

  const isMalformed = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return false;
    try {
      return !Array.isArray(JSON.parse(trimmed));
    } catch {
      return true;
    }
  }, [value]);

  const [newType, setNewType] = useState("lecture");
  const [newLabel, setNewLabel] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [rowErr, setRowErr] = useState("");

  function commit(next: PeriodRow[]) {
    onChange(next.length > 0 ? JSON.stringify(next, null, 2) : "");
  }

  function addRow() {
    if (!newLabel.trim()) {
      setRowErr("Enter a label for this period (e.g. \"Orientation Week\").");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newStart) || !/^\d{4}-\d{2}-\d{2}$/.test(newEnd)) {
      setRowErr("Pick a valid start and end date.");
      return;
    }
    if (newStart > newEnd) {
      setRowErr("Start date must be on or before end date.");
      return;
    }
    setRowErr("");
    commit([...rows, { type: newType, label: newLabel.trim(), startDate: newStart, endDate: newEnd }]);
    setNewLabel("");
    setNewStart("");
    setNewEnd("");
  }

  function removeRow(idx: number) {
    commit(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      {isMalformed && (
        <Notice tone="warning">
          The current timeline data isn't a valid list, so nothing here will publish as periods. Fix it in the raw JSON box below, or clear it and rebuild it here.
        </Notice>
      )}

      {rows.length > 0 && (
        <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Chip>{periodTypeLabel(r.type)}</Chip>
                  <span className="font-mono text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {r.startDate || "?"} → {r.endDate || "?"}
                  </span>
                </div>
                {r.label && <div className="mt-0.5 truncate text-sm font-bold text-slate-800 dark:text-slate-100">{r.label}</div>}
              </div>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 rounded-xl px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      {rows.length === 0 && !isMalformed && (
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          No timeline periods yet. Add one below, or leave empty to publish just the semester span (and break, if set).
        </p>
      )}

      <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/40">
        <div className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Add a period</div>
        {rowErr && <div className="mb-2 text-xs font-bold text-rose-600 dark:text-rose-400" role="alert">{rowErr}</div>}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <Select value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Period type">
            {PERIOD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <TextInput
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label, e.g. Orientation Week"
            aria-label="Period label"
          />
          <TextInput type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} aria-label="Period start date" />
          <TextInput type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} aria-label="Period end date" />
          <button
            type="button"
            onClick={addRow}
            className="col-span-2 h-11 shrink-0 rounded-2xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-700 lg:col-span-1 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            Add period
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * `publish` is the "Official calendars" tab (header + publish form);
 * `offers` is the "Existing offers" tab (the list of published offers).
 * Both views share this component so the list and the form keep one source
 * of state and refresh logic.
 */
export function CalendarUpdatesRoute({ view = "publish" }: { view?: "publish" | "offers" } = {}) {
  const { requestSafeAction, safeActionDialog } = useSafeActionDialog();
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
  const [offersAge, setOffersAge] = useState<"all" | "expired" | "redundant">("all");
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

  const selectedUniversityCountry = useMemo(() => {
    const id = String(selected || "").trim();
    const u = eligible.find((x) => x.id === id);
    return u?.country;
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

  const redundantCalendarIds = useMemo(
    () => duplicateRecordIds(history, (offer) => [
      offer.university_id,
      offer.campus_id ?? 'all',
      normaliseRecordName(offer.semester_label),
      offer.start_date,
      offer.end_date,
    ].join('|')),
    [history],
  );

  const filteredHistory = useMemo(() => {
    const qTop = searchQuery.trim();
    const qLocal = offersSearch.trim();
    const uni = offersUni.trim();
    const today = new Date().toISOString().slice(0, 10);
    return history.filter((h) => {
      if (uni && h.university_id !== uni) return false;
      if (offersAge === "expired" && !(h.source === "admin" && h.start_date < today && h.end_date < today)) return false;
      if (offersAge === "redundant" && !redundantCalendarIds.has(h.id)) return false;
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
  }, [history, offersAge, offersSearch, offersUni, searchQuery, universityNameById, redundantCalendarIds]);

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

  const deleteSelectedExpiredAdminOffers = () => {
    if (!selectedExpiredOfferIds.length && !selectAllExpiredAdminOffers) return;
    const count = selectedExpiredOfferIds.length;
    const affected = selectAllExpiredAdminOffers ? expiredAdminOffers.length : count;
    requestSafeAction({ title: 'Delete expired academic calendars', operation: 'Delete calendars', affectedCount: affected, confirmationText: `DELETE ${affected}`, requireReason: true, irreversible: true, warning: 'Only admin offers whose start and end dates have both passed are eligible. Active calendars are protected server-side.', onConfirm: async (reason) => {
      setErr(""); setOkMsg(""); setDeletingExpiredOffers(true);
      try {
        const deletedCount = await deleteExpiredAdminCalendarOffers(selectedExpiredOfferIds, selectAllExpiredAdminOffers, reason);
        setSelectedExpiredOfferIds([]); setSelectAllExpiredAdminOffers(false); await refreshHistory();
        setOkMsg(`${deletedCount} old academic calendar offer${deletedCount === 1 ? "" : "s"} deleted.`);
        return { affected: deletedCount, failed: Math.max(0, affected - deletedCount) };
      } finally { setDeletingExpiredOffers(false); }
    } });
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
        const normalizedPeriods = parsed.map((period, index) => {
          if (!period || typeof period !== "object") {
            throw new Error(`Period ${index + 1} must be an object.`);
          }
          const value = period as Record<string, unknown>;
          return {
            type: String(value.type ?? "other").trim() || "other",
            label: String(value.label ?? "").trim(),
            startDate: String(value.startDate ?? value.start_date ?? "").trim().slice(0, 10),
            endDate: String(value.endDate ?? value.end_date ?? "").trim().slice(0, 10),
          };
        });
        for (const [index, period] of normalizedPeriods.entries()) {
          // Ignore a completely empty draft row, but never silently accept a
          // partially filled period or dates outside the semester.
          if (!period.label && !period.startDate && !period.endDate) continue;
          if (
            !period.label ||
            !/^\d{4}-\d{2}-\d{2}$/.test(period.startDate) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(period.endDate) ||
            period.startDate > period.endDate ||
            period.startDate < sd ||
            period.endDate > ed
          ) {
            setErr(`Period ${index + 1} needs a label and valid dates inside the semester, or remove the empty draft row.`);
            return;
          }
        }
        periods = normalizedPeriods.filter(
          (period) => Boolean(period.label || period.startDate || period.endDate),
        );
      } catch {
        setErr("Periods JSON is not valid JSON or contains an invalid period.");
        return;
      }
    }
    const bs = breakStart.trim().slice(0, 10);
    const be = breakEnd.trim().slice(0, 10);
    const break_start = /^\d{4}-\d{2}-\d{2}$/.test(bs) ? bs : null;
    const break_end = /^\d{4}-\d{2}-\d{2}$/.test(be) ? be : null;

    const duplicate = history.find(
      (offer) =>
        offer.university_id === selected &&
        (offer.campus_id ?? null) === campId &&
        normaliseRecordName(offer.semester_label) === normaliseRecordName(label) &&
        offer.start_date === sd &&
        offer.end_date === ed,
    );
    if (duplicate) {
      setErr(
        "This university/campus calendar already exists. Open the Existing offers tab and filter Redundant calendars if cleanup is needed.",
      );
      return;
    }

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

  // ── Button handlers (moved out of the JSX unchanged, so the layout can be read) ──

  const extractFromUrl = async () => {
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
      const res = await extractCalendarFromUrl(url, selectedUniversityCountry);
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
  };

  const extractFromPdf = async () => {
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
        selectedUniversityCountry,
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
  };

  const extractFromImage = async () => {
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
        selectedUniversityCountry,
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
  };

  const deleteOneOffer = async (h: AdminCalendarOfferRow) => {
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
  };

  // ── Display-only helpers ──

  const statusBanners = err || okMsg ? (
    <div className="space-y-2">
      {err ? <Notice tone="danger">{err}</Notice> : null}
      {okMsg ? <Notice tone="success">{okMsg}</Notice> : null}
    </div>
  ) : null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const selectedCampusName = selectedCampus
    ? uniCampuses.find((c) => c.id === selectedCampus)?.name ?? selectedCampus
    : "All campuses";
  // Preview of what will be published (drawing only; publish() re-checks everything).
  const draftDatesOk =
    /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim().slice(0, 10)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim().slice(0, 10)) &&
    startDate.trim().slice(0, 10) <= endDate.trim().slice(0, 10);
  const draftOffer: CalendarGraphicOffer = {
    semester_label: semesterLabel.trim() || "Untitled semester",
    start_date: startDate.trim().slice(0, 10),
    end_date: endDate.trim().slice(0, 10),
    total_weeks: Math.max(1, Math.min(52, Number(totalWeeks) || 14)),
    break_start_date: breakStart.trim().slice(0, 10) || null,
    break_end_date: breakEnd.trim().slice(0, 10) || null,
    periods_json: parsePeriodsJson(periodsJson),
  };
  const activeCandidate = extractCandidates[extractCandidateIdx];

  return (
    <div className="space-y-5">
      {view === "publish" ? (
        <>
          <PageHeader
            title="Official calendars"
            description="Set semester dates for each university. Students at that university get the calendar automatically."
            actions={
              <Button type="button" variant="ghost" size="sm" onClick={() => setPublishOpen((v) => !v)} aria-expanded={publishOpen}>
                {publishOpen ? "Collapse form" : "Expand form"}
              </Button>
            }
          />

          {publishOpen ? (
            <>
              <Panel
                title="1. University"
                description="Each university has its own calendar. UiTM is not in this list: its students use the portal calendar (HEA)."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0">
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
                        className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:border-brand-500 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-100"
                      >
                        <span className={selected ? "truncate" : "truncate text-slate-400 dark:text-slate-500"}>{selectedUniversityLabel}</span>
                        <span className="text-slate-400" aria-hidden="true">▾</span>
                      </button>

                      {universityOpen ? (
                        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
                          <div className="p-2">
                            <TextInput
                              autoFocus
                              value={universitySearch}
                              onChange={(e) => setUniversitySearch(e.target.value)}
                              placeholder="Search university (type name or id, e.g. UTM)"
                              aria-label="Search university"
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
                                  {active ? <span className="text-xs font-black">Selected</span> : null}
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
                      <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        No universities found. They will be auto-seeded on page reload.
                      </p>
                    ) : null}
                  </div>

                  {uniCampuses.length > 0 ? (
                    <Field label="Campus (optional)">
                      <Select value={selectedCampus} onChange={(e) => setSelectedCampus(e.target.value)}>
                        <option value="">All Campuses</option>
                        {uniCampuses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                </div>
              </Panel>

              <Panel
                title="2. Auto-fill from the official calendar (optional)"
                description="AI reads a web page, PDF or image and fills in the form below. Always check the result before you publish."
              >
                <div className="grid gap-3 lg:grid-cols-3">
                  <SourceCard
                    title="From a web page"
                    help="Paste the official academic calendar URL. The page is read and its dates, weeks and periods are filled in."
                    err={extractErr}
                    ok={extractOk}
                  >
                    <TextInput
                      value={extractUrl}
                      onChange={(e) => setExtractUrl(e.target.value)}
                      placeholder="https://www.university.edu.my/academic-calendar"
                      aria-label="Official calendar web address"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={extracting || !extractUrl.trim()}
                      onClick={extractFromUrl}
                      className="whitespace-nowrap"
                    >
                      {extracting ? (
                        <>
                          <Spinner />
                          Extracting…
                        </>
                      ) : (
                        "Extract and fill"
                      )}
                    </Button>
                  </SourceCard>

                  <SourceCard
                    title="From a PDF"
                    help="Upload the calendar PDF (max 10 MB). The same file is also saved as the reference PDF when you publish."
                    err={pdfExtractErr}
                    ok={pdfExtractOk}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      aria-label="Calendar PDF"
                      className="block w-full min-w-0 text-xs font-semibold text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:text-slate-200 dark:file:bg-white dark:file:text-slate-950"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={pdfExtracting}
                      onClick={extractFromPdf}
                      className="whitespace-nowrap"
                    >
                      {pdfExtracting ? (
                        <>
                          <Spinner />
                          Extracting from PDF…
                        </>
                      ) : (
                        "Extract and fill from PDF"
                      )}
                    </Button>
                  </SourceCard>

                  <SourceCard
                    title="From an image"
                    help="Upload a screenshot, photo or scan (max 10 MB). GPT-4o Vision reads the dates, weeks and periods."
                    err={imgExtractErr}
                    ok={imgExtractOk}
                  >
                    <input
                      ref={imgFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      aria-label="Calendar image"
                      className="block w-full min-w-0 text-xs font-semibold text-slate-700 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white dark:text-slate-200 dark:file:bg-white dark:file:text-slate-950"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={imgExtracting}
                      onClick={extractFromImage}
                      className="whitespace-nowrap"
                    >
                      {imgExtracting ? (
                        <>
                          <Spinner />
                          Extracting…
                        </>
                      ) : (
                        "Extract and fill from image"
                      )}
                    </Button>
                  </SourceCard>
                </div>

                {extractCandidates.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <Field
                      label={extractCandidates.some((c) => c.campus_group) ? "Institute / program" : "Program level"}
                      hint={`${extractCandidates.length} calendar(s) found. Picking one fills the form with it.`}
                    >
                      <Select
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
                      </Select>
                    </Field>
                    {activeCandidate?.campus_group_description ? (
                      <Notice tone="warning">
                        <span className="font-black">{activeCandidate?.campus_group}:</span>{" "}
                        {activeCandidate?.campus_group_description}
                      </Notice>
                    ) : null}
                  </div>
                ) : null}
              </Panel>

              <Panel title="3. Semester details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Semester label">
                    <TextInput
                      value={semesterLabel}
                      onChange={(e) => setSemesterLabel(e.target.value)}
                      placeholder="e.g. Semester 1 2025/2026"
                    />
                  </Field>
                  <Field label="Total teaching weeks">
                    <TextInput
                      value={totalWeeks}
                      onChange={(e) => setTotalWeeks(e.target.value)}
                      placeholder="14"
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Start date">
                    <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </Field>
                  <Field label="End date">
                    <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Field>
                  <Field label="Break start (optional)">
                    <TextInput type="date" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
                  </Field>
                  <Field label="Break end (optional)">
                    <TextInput type="date" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
                  </Field>
                  <Field label="Official link (optional)" className="sm:col-span-2">
                    <TextInput value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://…" />
                  </Field>
                  <Field label="Admin note to students (optional)" className="sm:col-span-2">
                    <Textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      rows={3}
                      className="text-sm"
                      placeholder="Short message shown in the app prompt"
                    />
                  </Field>
                </div>
              </Panel>

              <Panel
                title="4. Timeline periods (optional)"
                description="Orientation, lecture weeks, exams, semester break, public holidays, etc. Auto-fill adds these; add, remove or correct them by hand here."
              >
                <div className="space-y-4">
                  <PeriodListEditor value={periodsJson} onChange={setPeriodsJson} />
                  <details className="group rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <summary className="cursor-pointer text-xs font-black text-slate-600 dark:text-slate-300">
                      Raw timeline JSON (advanced)
                    </summary>
                    <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      The same data as the list above, as raw JSON, for bulk edits or a technical fix. Both stay in sync.
                    </p>
                    <Field label="Timeline JSON (optional)" className="mt-3">
                      <Textarea
                        value={periodsJson}
                        onChange={(e) => setPeriodsJson(e.target.value)}
                        rows={4}
                        className="font-mono"
                        placeholder='[{"type":"lecture","label":"…","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"}]'
                      />
                    </Field>
                  </details>
                </div>
              </Panel>

              <Panel
                title="5. Check and publish"
                description="This goes straight to every student at this university. There is no review step after you press Publish."
              >
                <div className="space-y-4">
                  <FactGrid
                    items={[
                      ["University", selected ? selectedUniversityLabel : "Not picked yet"],
                      ["Campus", selected ? selectedCampusName : "—"],
                      ["Semester", semesterLabel.trim() || "—"],
                      ["Dates", startDate || endDate ? `${startDate || "?"} → ${endDate || "?"}` : "—"],
                    ]}
                  />
                  {draftDatesOk ? (
                    <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                      <AcademicCalendarOfferGraphic offer={draftOffer} />
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Pick a start and end date to see the timeline preview.
                    </p>
                  )}
                  {statusBanners}
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void publish()}
                    className="w-full sm:w-auto"
                  >
                    {busy ? "Publishing…" : "Publish offers"}
                  </Button>
                </div>
              </Panel>
            </>
          ) : null}
        </>
      ) : null}

      {view === "offers" ? (
        <>
          <PageHeader
            title="Existing offers"
            description="Every published calendar offer, grouped by university."
            actions={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setOffersUni("");
                    setOffersSearch("");
                    setOffersAge("all");
                    setSelectedExpiredOfferIds([]);
                    setSelectAllExpiredAdminOffers(false);
                  }}
                >
                  Reset
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setOffersOpen((v) => !v)} aria-expanded={offersOpen}>
                  {offersOpen ? "Collapse" : "Expand"}
                </Button>
              </>
            }
          />
          {statusBanners}

          {offersOpen ? (
            <>
              <Panel>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="University">
                      <Select value={offersUni} onChange={(e) => setOffersUni(e.target.value)}>
                        <option value="">All</option>
                        {offerUniOptions.map((u) => (
                          <option key={u} value={u}>
                            {universityNameById.get(u) ?? u} ({u})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Search">
                      <TextInput
                        value={offersSearch}
                        onChange={(e) => setOffersSearch(e.target.value)}
                        placeholder="Search semester, note, url…"
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <PillGroup label="Show">
                      <Pill active={offersAge === "all"} onClick={() => setOffersAge("all")}>All admin offers</Pill>
                      <Pill
                        active={offersAge === "expired"}
                        count={expiredAdminOffers.length}
                        onClick={() => setOffersAge("expired")}
                        title="Admin offers whose start and end dates have both passed"
                      >
                        Old academic calendars
                      </Pill>
                      <Pill
                        active={offersAge === "redundant"}
                        count={redundantCalendarIds.size}
                        onClick={() => setOffersAge("redundant")}
                        title="Same university, campus, semester name and dates"
                      >
                        Redundant calendars
                      </Pill>
                    </PillGroup>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Showing <span className="font-black text-slate-700 dark:text-slate-200">{filteredHistory.length}</span> offer(s)
                      {searchQuery.trim() ? " (also filtered by top search bar)" : ""} · ordered by calendar end date
                    </div>
                  </div>
                </div>
              </Panel>

              {offersAge === "redundant" ? (
                <Notice tone="warning">
                  Redundant calendars share the same university, campus, semester name and dates. Review each group and delete only the record you choose.
                </Notice>
              ) : null}

              {expiredAdminOffers.length ? (
                <CleanupBox
                  tone="warning"
                  title={
                    <label className="inline-flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        className={CHECKBOX}
                        checked={allExpiredAdminOffersSelected}
                        onChange={toggleAllExpiredAdminOffers}
                        disabled={deletingExpiredOffers}
                      />
                      <span>Select all old academic calendars (including unloaded offers)</span>
                    </label>
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => void deleteSelectedExpiredAdminOffers()}
                      disabled={(selectedExpiredOfferIds.length === 0 && !selectAllExpiredAdminOffers) || deletingExpiredOffers}
                      className={BTN_DANGER}
                    >
                      {deletingExpiredOffers ? "Deleting…" : selectAllExpiredAdminOffers ? "Delete all old calendars" : `Delete selected (${selectedExpiredOfferIds.length})`}
                    </button>
                  }
                >
                  Or open a university below and tick single old calendars.
                </CleanupBox>
              ) : null}

              <div className="space-y-3">
                {groupedAdminHistory.map((group) => {
                  const open = Boolean(openOfferGroups[group.universityId]);
                  return (
                    <section
                      key={group.universityId}
                      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900"
                    >
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenOfferGroups((prev) => ({
                            ...prev,
                            [group.universityId]: !prev[group.universityId],
                          }))
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <span className="min-w-0 text-sm font-black text-slate-900 dark:text-slate-100">
                          {group.universityName}
                        </span>
                        <span className="flex items-center gap-3">
                          <Chip>{group.offers.length} offer(s)</Chip>
                          <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                            {open ? "Hide" : "Show"}
                          </span>
                        </span>
                      </button>

                      {open ? (
                        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                          {group.offers.map((h) => {
                            const isOld = h.source === "admin" && h.start_date < todayIso && h.end_date < todayIso;
                            const campusLabel = h.campus_id
                              ? allCampuses.find((c) => c.id === h.campus_id)?.name || "Unknown Campus"
                              : "All Campuses";
                            return (
                              <li key={h.id} className="space-y-3 px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3">
                                    {isOld ? (
                                      <input
                                        type="checkbox"
                                        className={`${CHECKBOX} mt-1`}
                                        checked={selectedExpiredOfferIds.includes(h.id)}
                                        onChange={() => toggleExpiredAdminOffer(h.id)}
                                        disabled={deletingExpiredOffers}
                                        aria-label={`Select old calendar ${h.semester_label}`}
                                      />
                                    ) : null}
                                    <div className="min-w-0">
                                      <div className="text-sm font-black text-slate-900 dark:text-slate-100">{h.semester_label}</div>
                                      <div className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {campusLabel} · {h.start_date} → {h.end_date} · {h.total_weeks} teaching weeks
                                      </div>
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {h.source === "crowdsourced" ? (
                                          <Chip tone="info">Crowdsourced user submission</Chip>
                                        ) : (
                                          <Chip tone="success">Admin verified</Chip>
                                        )}
                                        {isOld ? <Chip tone="warning">Old calendar</Chip> : null}
                                        {redundantCalendarIds.has(h.id) ? (
                                          <Chip tone="warning" title="Review this duplicate group and delete only the record you choose.">
                                            Redundant calendar
                                          </Chip>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-3">
                                    {h.official_url ? (
                                      <a href={h.official_url} target="_blank" rel="noreferrer" className={LINK_SM}>
                                        Link
                                      </a>
                                    ) : null}
                                    {h.reference_pdf_url ? (
                                      <a href={h.reference_pdf_url} target="_blank" rel="noreferrer" className={LINK_SM}>
                                        PDF
                                      </a>
                                    ) : null}
                                    <button
                                      type="button"
                                      className={BTN_DANGER_SOFT}
                                      disabled={Boolean(deletingOfferId) || deletingExpiredOffers}
                                      onClick={() => deleteOneOffer(h)}
                                    >
                                      {deletingOfferId === h.id ? "Deleting…" : "Delete"}
                                    </button>
                                  </div>
                                </div>
                                <AcademicCalendarOfferGraphic offer={h} />
                                {h.admin_note ? (
                                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{h.admin_note}</p>
                                ) : null}
                                <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                                  Published {new Date(h.created_at).toLocaleString()}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </section>
                  );
                })}
                {groupedAdminHistory.length === 0 ? (
                  <EmptyState title="No admin offers to show">
                    Nothing is published yet, or the filters hide everything. Press Reset to clear the filters.
                  </EmptyState>
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
      {safeActionDialog}
    </div>
  );
}
