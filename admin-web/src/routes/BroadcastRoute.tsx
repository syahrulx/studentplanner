import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  listUniversities,
  listBroadcastCampuses,
  type BroadcastCampus,
  listUsers,
  previewBroadcast,
  sendBroadcast,
  type AdminUserRow,
  type BroadcastAudience,
  type BroadcastCategory,
  type SendBroadcastResult,
  type UniversityRow,
} from '../lib/api';
import { Button } from '../ui/Button';
import { Label, Select, TextInput, Textarea } from '../ui/Input';
import { Chip, Notice, PageHeader, Panel, Pill, PillGroup, StatItem } from '../ui/page';

const CATEGORY_OPTIONS: Array<{ value: BroadcastCategory; label: string; hint: string }> = [
  { value: 'reaction', label: 'Reaction (default)', hint: 'Respects push_reactions_enabled' },
  { value: 'shared_task', label: 'Shared task', hint: 'Respects push_shared_task_enabled' },
  { value: 'circle', label: 'Circle', hint: 'Respects push_circle_enabled' },
  { value: 'friend', label: 'Friend', hint: 'Respects push_friend_requests_enabled' },
];

const AUDIENCE_OPTIONS: Array<{ value: BroadcastAudience; label: string; hint: string }> = [
  { value: 'all', label: 'Everyone', hint: 'Sends to every eligible user (all users with push enabled).' },
  { value: 'university', label: 'By university', hint: 'Sends to everyone at the selected university.' },
  { value: 'campus', label: 'By campus', hint: 'Sends to students at the campuses you tick, in one university.' },
  { value: 'user_ids', label: 'Specific users', hint: 'Pick individuals or “Select all matching” in the list below.' },
];

/** Small text link used for list actions (All, None, Clear...). */
const LINK_BTN = 'text-xs font-black text-brand-700 hover:underline disabled:opacity-40 dark:text-brand-300';

type FormState = {
  audience: BroadcastAudience;
  universityId: string;
  campuses: string[];
  userIdsText: string;
  title: string;
  body: string;
  category: BroadcastCategory;
  route: string;
  paramsText: string;
};

const USER_PAGE_SIZE = 25;

/** Plain words for the push service's error codes. */
const TICKET_REASON: Record<string, string> = {
  DeviceNotRegistered: 'app removed or notifications turned off on the phone',
  InvalidCredentials: 'push keys for iOS/Android are wrong or expired (fix in Expo)',
  MessageTooBig: 'message too long',
  MessageRateExceeded: 'sent too fast to one phone',
  MismatchSenderId: 'Android push key mismatch (fix in Expo/Firebase)',
};

/** Counts the push service's per-phone answers in a send result. */
function summarizeTickets(results: unknown): { ok: number; failed: number; reasons: Record<string, number> } | null {
  if (!Array.isArray(results)) return null;
  let ok = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};
  results.forEach((batch) => {
    const tickets = (batch as { data?: unknown })?.data;
    if (!Array.isArray(tickets)) return;
    tickets.forEach((t: { status?: string; message?: string; details?: { error?: string } }) => {
      if (t?.status === 'ok') ok += 1;
      else {
        failed += 1;
        const key = t?.details?.error || t?.message || 'unknown';
        reasons[key] = (reasons[key] ?? 0) + 1;
      }
    });
  });
  return ok + failed > 0 ? { ok, failed, reasons } : null;
}

/** Case-insensitive "contains", ignoring extra spaces, for the type-to-search boxes. */
const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').trim();
const matches = (text: string, query: string) => !query.trim() || norm(text).includes(norm(query));

/** Type part of a university's name (or its short id, e.g. "uitm") and pick from the matches. */
function UniversitySearch({
  universities,
  value,
  onChange,
}: {
  universities: UniversityRow[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = universities.find((u) => u.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const found = universities.filter((u) => matches(u.name, query) || matches(u.id, query)).slice(0, 30);

  if (selected && !open) {
    return (
      <div className="mt-1 flex items-center gap-2 rounded-2xl border border-brand-500 bg-brand-50 px-4 py-2.5 text-sm font-bold text-slate-900 dark:border-brand-400 dark:bg-brand-900/40 dark:text-slate-100">
        <span className="truncate">{selected.name}</span>
        <button
          type="button"
          className={`ml-auto ${LINK_BTN}`}
          onClick={() => {
            setQuery('');
            setOpen(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative mt-1">
      <TextInput
        autoFocus={open}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && found[0]) {
            e.preventDefault();
            onChange(found[0].id);
            setOpen(false);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Type a university name, e.g. UiTM"
        aria-label="Search universities"
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {found.length === 0 ? (
            <div className="px-3 py-2 text-sm font-semibold text-slate-400 dark:text-slate-500">No university matches “{query}”.</div>
          ) : (
            found.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(u.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <span className="truncate">{u.name}</span>
                <span className="ml-auto shrink-0 text-[11px] font-bold uppercase text-slate-400 dark:text-slate-500">{u.id}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,;\n]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function userLabel(u: AdminUserRow): string {
  const name = (u.name ?? '').trim();
  const sid = (u.student_id ?? '').trim();
  if (name && sid) return `${name} · ${sid}`;
  if (name) return name;
  if (sid) return sid;
  return u.id.slice(0, 8);
}

function parseParams(raw: string): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Params must be a JSON object' };
    }
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = String(v);
      } else {
        return { ok: false, error: `Value for "${k}" must be string/number/boolean` };
      }
    }
    return { ok: true, value: out };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function BroadcastRoute() {
  const [form, setForm] = useState<FormState>({
    audience: 'all',
    universityId: '',
    campuses: [],
    userIdsText: '',
    title: '',
    body: '',
    category: 'reaction',
    route: '',
    paramsText: '',
  });

  const [universities, setUniversities] = useState<UniversityRow[]>([]);
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState('');

  const [sendBusy, setSendBusy] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [sendResult, setSendResult] = useState<SendBroadcastResult | null>(null);
  // Final numbers of a background send, read from its admin_logs row.
  const [finalLog, setFinalLog] = useState<{ status: string; meta: Record<string, unknown> } | null>(null);
  useEffect(() => {
    const logId = sendResult?.queued ? sendResult.log_id : null;
    setFinalLog(null);
    if (!logId) return;
    let stop = false;
    let tries = 0;
    const tick = async () => {
      if (stop) return;
      tries += 1;
      const { data } = await supabase.from('admin_logs').select('status, meta').eq('id', logId).maybeSingle();
      const row = data as { status: string; meta: Record<string, unknown> } | null;
      if (row && (row.meta?.phase === 'done' || row.meta?.phase === 'failed')) {
        if (!stop) setFinalLog(row);
        return;
      }
      if (tries < 60) setTimeout(() => void tick(), 5000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [sendResult]);

  // ---------------------------------------------------------------------------
  // Individual user picker (audience === 'user_ids')
  // ---------------------------------------------------------------------------
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerUniversityId, setPickerUniversityId] = useState('');
  const [pickerPage, setPickerPage] = useState(0);
  const [pickerItems, setPickerItems] = useState<AdminUserRow[]>([]);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerErr, setPickerErr] = useState('');
  // Map keeps label cache so selected chips don't disappear when user scrolls/filters.
  const [selectedUsers, setSelectedUsers] = useState<Map<string, AdminUserRow>>(new Map());
  const [showPasteBox, setShowPasteBox] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const items = await listUniversities();
        setUniversities(items);
      } catch {
        // Non-fatal: user can still broadcast to all / by id.
      }
    })();
  }, []);

  // Campus list for the chosen university (audience === 'campus').
  const [campusList, setCampusList] = useState<BroadcastCampus[]>([]);
  const [campusBusy, setCampusBusy] = useState(false);
  const [campusErr, setCampusErr] = useState('');
  const [campusQuery, setCampusQuery] = useState('');
  useEffect(() => {
    setCampusQuery('');
    if (form.audience !== 'campus' || !form.universityId) {
      setCampusList([]);
      return;
    }
    let cancelled = false;
    setCampusBusy(true);
    setCampusErr('');
    listBroadcastCampuses(form.universityId)
      .then((list) => !cancelled && setCampusList(list))
      .catch((e) => !cancelled && setCampusErr(e instanceof Error ? e.message : 'Could not load campuses'))
      .finally(() => !cancelled && setCampusBusy(false));
    return () => {
      cancelled = true;
    };
  }, [form.audience, form.universityId]);

  // A changed audience makes an earlier preview count wrong.
  useEffect(() => {
    setPreview(null);
  }, [form.audience, form.universityId, form.campuses]);

  // Reset paging whenever search/filter changes.
  useEffect(() => {
    setPickerPage(0);
  }, [pickerQuery, pickerUniversityId]);

  // Fetch users when the picker is visible OR when query/filter/page changes.
  useEffect(() => {
    if (form.audience !== 'user_ids') return;
    let cancelled = false;
    (async () => {
      setPickerBusy(true);
      setPickerErr('');
      try {
        const res = await listUsers({
          query: pickerQuery.trim() || undefined,
          universityId: pickerUniversityId || undefined,
          limit: USER_PAGE_SIZE,
          offset: pickerPage * USER_PAGE_SIZE,
        });
        if (cancelled) return;
        setPickerItems(res.items);
        setPickerTotal(res.count);
      } catch (e) {
        if (!cancelled) setPickerErr(e instanceof Error ? e.message : 'Failed to load users');
      } finally {
        if (!cancelled) setPickerBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.audience, pickerQuery, pickerUniversityId, pickerPage]);

  const parsedUserIds = useMemo(() => Array.from(selectedUsers.keys()), [selectedUsers]);
  const pastedUserIds = useMemo(() => parseUserIds(form.userIdsText), [form.userIdsText]);
  const parsedParams = useMemo(() => parseParams(form.paramsText), [form.paramsText]);

  const mergedUserIds = useMemo(() => {
    if (!showPasteBox) return parsedUserIds;
    const set = new Set<string>(parsedUserIds);
    for (const id of pastedUserIds) set.add(id);
    return Array.from(set);
  }, [parsedUserIds, pastedUserIds, showPasteBox]);

  const allOnPageSelected =
    pickerItems.length > 0 && pickerItems.every((u) => selectedUsers.has(u.id));
  const someOnPageSelected =
    !allOnPageSelected && pickerItems.some((u) => selectedUsers.has(u.id));

  const togglePickerUser = (u: AdminUserRow) => {
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, u);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    setSelectedUsers((prev) => {
      const next = new Map(prev);
      if (allOnPageSelected) {
        for (const u of pickerItems) next.delete(u.id);
      } else {
        for (const u of pickerItems) next.set(u.id, u);
      }
      return next;
    });
  };

  const selectAllMatching = async () => {
    setPickerBusy(true);
    setPickerErr('');
    try {
      // Cap at 1000 to avoid huge payloads; enough for typical broadcast lists.
      const res = await listUsers({
        query: pickerQuery.trim() || undefined,
        universityId: pickerUniversityId || undefined,
        limit: 1000,
        offset: 0,
      });
      setSelectedUsers((prev) => {
        const next = new Map(prev);
        for (const u of res.items) next.set(u.id, u);
        return next;
      });
    } catch (e) {
      setPickerErr(e instanceof Error ? e.message : 'Failed to select all');
    } finally {
      setPickerBusy(false);
    }
  };

  const clearSelection = () => setSelectedUsers(new Map());

  const canPreview =
    form.audience === 'all' ||
    (form.audience === 'university' && !!form.universityId) ||
    (form.audience === 'campus' && !!form.universityId && form.campuses.length > 0) ||
    (form.audience === 'user_ids' && mergedUserIds.length > 0);

  const routeInvalid = form.route.trim() !== '' && !form.route.trim().startsWith('/');
  const paramsInvalid = !parsedParams.ok;
  const canSend =
    canPreview &&
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    !routeInvalid &&
    !paramsInvalid;

  const runPreview = async () => {
    setPreviewBusy(true);
    setPreviewErr('');
    setPreview(null);
    try {
      const res = await previewBroadcast({
        audience: form.audience,
        universityId: form.audience === 'university' || form.audience === 'campus' ? form.universityId : undefined,
        campuses: form.audience === 'campus' ? form.campuses : undefined,
        userIds: form.audience === 'user_ids' ? mergedUserIds : undefined,
      });
      setPreview(res);
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewBusy(false);
    }
  };

  const runSend = async () => {
    if (!canSend) return;

    // Extra guard for blasting everyone: require typed confirmation so a
    // mis-click on the Send button can't spam the whole user base.
    if (form.audience === 'all') {
      const typed = window.prompt(
        `You are about to push "${form.title.trim()}" to EVERY eligible user ` +
          `(${preview?.count?.toLocaleString() ?? 'N'}).\n\n` +
          `Type SEND TO EVERYONE to confirm:`,
      );
      if (!typed || typed.trim() !== 'SEND TO EVERYONE') {
        return;
      }
    } else if (
      !window.confirm(
        `Send push to ${preview?.count ?? 'N'} user(s)?\n\nTitle: ${form.title.trim()}\n\nThis cannot be undone.`,
      )
    ) {
      return;
    }

    setSendBusy(true);
    setSendErr('');
    setSendResult(null);
    try {
      const params = parsedParams.ok ? parsedParams.value : {};
      const route = form.route.trim();
      const res = await sendBroadcast({
        audience: form.audience,
        universityId: form.audience === 'university' || form.audience === 'campus' ? form.universityId : undefined,
        campuses: form.audience === 'campus' ? form.campuses : undefined,
        userIds: form.audience === 'user_ids' ? mergedUserIds : undefined,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        route: route || undefined,
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      setSendResult(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Send failed';
      setSendErr(
        /duplicate_broadcast/.test(msg)
          ? 'Not sent again: this exact broadcast already went to this audience in the last 15 minutes. Change the title if you really mean to send a new one.'
          : msg,
      );
    } finally {
      setSendBusy(false);
    }
  };


  // Display-only summaries for the "Review and send" card (no data changes).
  const audienceOption = AUDIENCE_OPTIONS.find((o) => o.value === form.audience);
  const categoryOption = CATEGORY_OPTIONS.find((o) => o.value === form.category);
  const selectedUniversity = universities.find((u) => u.id === form.universityId);
  const selectedCampusStudents = campusList
    .filter((c) => form.campuses.includes(c.campus))
    .reduce((n, c) => n + c.count, 0);
  const audienceSummary =
    form.audience === 'all'
      ? 'Everyone'
      : form.audience === 'user_ids'
        ? `${mergedUserIds.length.toLocaleString()} user(s)`
        : !selectedUniversity
          ? 'No university picked yet'
          : form.audience === 'campus'
            ? `${form.campuses.length} campus(es) at ${selectedUniversity.name}`
            : selectedUniversity.name;
  const missing: string[] = [];
  if (!canPreview) {
    missing.push(
      form.audience === 'user_ids'
        ? 'pick at least one user'
        : !form.universityId
          ? 'pick a university'
          : 'tick at least one campus',
    );
  }
  if (!form.title.trim()) missing.push('add a title');
  if (!form.body.trim()) missing.push('add a body');
  if (routeInvalid) missing.push('fix the deep link');
  if (paramsInvalid) missing.push('fix the route params');

  return (
    <div className="space-y-5">
      <PageHeader
        title="Broadcast"
        description="Send a push notification to users. Respects each user’s community push opt-in and category preferences."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* Left: build the broadcast */}
        <div className="min-w-0 space-y-5">
          <Panel title="1. Audience" description={audienceOption?.hint}>
            <div role="group" aria-label="Audience">
              <PillGroup>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <Pill
                    key={opt.value}
                    active={form.audience === opt.value}
                    onClick={() => setForm((f) => ({ ...f, audience: opt.value, userIdsText: f.userIdsText }))}
                  >
                    {opt.label}
                  </Pill>
                ))}
              </PillGroup>
            </div>

            {form.audience === 'university' || form.audience === 'campus' ? (
              <div className="mt-5">
                <Label>University</Label>
                <UniversitySearch
                  universities={universities}
                  value={form.universityId}
                  onChange={(id) => setForm((f) => ({ ...f, universityId: id, campuses: [] }))}
                />
              </div>
            ) : null}

            {form.audience === 'campus' && form.universityId ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Campuses</Label>
                  <div className="flex items-center gap-3 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>
                      {form.campuses.length} selected · {selectedCampusStudents.toLocaleString()} students
                    </span>
                    <button type="button" className={LINK_BTN} onClick={() => setForm((f) => ({ ...f, campuses: [...new Set([...f.campuses, ...campusList.filter((c) => c.count > 0 && matches(c.campus, campusQuery)).map((c) => c.campus)])] }))}>{campusQuery.trim() ? 'All shown' : 'All'}</button>
                    <button type="button" className={LINK_BTN} onClick={() => setForm((f) => ({ ...f, campuses: [] }))}>None</button>
                  </div>
                </div>
                {campusBusy ? <div className="mt-2 text-sm font-semibold text-slate-400 dark:text-slate-500">Loading campuses…</div> : null}
                {campusErr ? <Notice tone="danger" className="mt-2">{campusErr}</Notice> : null}
                {!campusBusy && !campusErr && campusList.length === 0 ? (
                  <div className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">No student at this university has set a campus yet.</div>
                ) : null}
                {campusList.length > 6 ? (
                  <TextInput
                    className="mt-2"
                    value={campusQuery}
                    onChange={(e) => setCampusQuery(e.target.value)}
                    placeholder="Type to find a campus, e.g. Arau"
                    aria-label="Search campuses"
                  />
                ) : null}
                <div className="mt-2 grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">
                  {campusList.filter((c) => matches(c.campus, campusQuery)).map((c) => {
                    const on = form.campuses.includes(c.campus);
                    return (
                      <label key={c.campus} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 ${on ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/40' : 'border-slate-200 dark:border-slate-800'} ${c.count === 0 ? 'opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={c.count === 0}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              campuses: e.target.checked ? [...f.campuses, c.campus] : f.campuses.filter((x) => x !== c.campus),
                            }))
                          }
                        />
                        <span className="truncate">{c.campus}</span>
                        <span className="ml-auto text-xs font-black text-slate-500 dark:text-slate-400">{c.count.toLocaleString()}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Campus names are shown exactly as students saved them. Some may appear twice with different spelling — tick both to reach everyone.
                </div>
              </div>
            ) : null}

            {form.audience === 'user_ids' ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Pick users</Label>
                  <div className="flex items-center gap-3 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{selectedUsers.size} selected</span>
                    {selectedUsers.size > 0 ? (
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="text-xs font-black text-rose-700 hover:underline dark:text-rose-300"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_minmax(160px,240px)]">
                  <TextInput
                    placeholder="Search by name or student ID"
                    aria-label="Search users by name or student ID"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  />
                  <Select
                    aria-label="Filter users by university"
                    value={pickerUniversityId}
                    onChange={(e) => setPickerUniversityId(e.target.value)}
                  >
                    <option value="">All universities</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Selected users */}
                {selectedUsers.size > 0 ? (
                  <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-auto rounded-2xl bg-slate-50 p-2 dark:bg-slate-950/40">
                    {Array.from(selectedUsers.values()).map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 py-0.5 pl-2 pr-1 text-[11px] font-bold text-brand-800 dark:bg-brand-900/40 dark:text-brand-100"
                      >
                        {userLabel(u)}
                        <button
                          type="button"
                          onClick={() => togglePickerUser(u)}
                          className="rounded-md px-1 text-brand-700/70 hover:bg-brand-100 hover:text-brand-900 dark:text-brand-200/70 dark:hover:bg-brand-800/60 dark:hover:text-brand-100"
                          aria-label={`Remove ${userLabel(u)}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* User list */}
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someOnPageSelected;
                        }}
                        onChange={toggleAllOnPage}
                        disabled={pickerItems.length === 0}
                      />
                      <span>Select all on this page</span>
                    </label>
                    <button
                      type="button"
                      onClick={selectAllMatching}
                      className={LINK_BTN}
                      disabled={pickerBusy || pickerTotal === 0}
                      title="Add every user matching your current search + university filter to the selection (max 1,000)."
                    >
                      + Select all matching ({pickerTotal.toLocaleString()})
                    </button>
                  </div>

                  <div className="max-h-80 overflow-auto">
                    {pickerBusy && pickerItems.length === 0 ? (
                      <div className="p-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">Loading…</div>
                    ) : pickerItems.length === 0 ? (
                      <div className="p-4 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">No users match.</div>
                    ) : (
                      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pickerItems.map((u) => {
                          const checked = selectedUsers.has(u.id);
                          return (
                            <li key={u.id}>
                              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePickerUser(u)}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                                    {u.name ?? <span className="italic text-slate-400 dark:text-slate-500">(no name)</span>}
                                  </div>
                                  <div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {u.student_id ?? '—'} · {u.id.slice(0, 8)}…
                                  </div>
                                </div>
                                <Chip tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</Chip>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Pager */}
                  {pickerTotal > USER_PAGE_SIZE ? (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                      <div>
                        {pickerPage * USER_PAGE_SIZE + 1}–
                        {Math.min((pickerPage + 1) * USER_PAGE_SIZE, pickerTotal)} of{' '}
                        {pickerTotal.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPickerPage((p) => Math.max(0, p - 1))}
                          disabled={pickerPage === 0 || pickerBusy}
                        >
                          Prev
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPickerPage((p) => p + 1)}
                          disabled={(pickerPage + 1) * USER_PAGE_SIZE >= pickerTotal || pickerBusy}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {pickerErr ? <Notice tone="danger" className="mt-2">{pickerErr}</Notice> : null}

                {/* Advanced: paste raw UUIDs */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowPasteBox((v) => !v)}
                    aria-expanded={showPasteBox}
                    className="text-xs font-bold text-slate-500 hover:underline dark:text-slate-400"
                  >
                    {showPasteBox ? '− Hide' : '+ Advanced'}: paste user UUIDs
                  </button>
                  {showPasteBox ? (
                    <div className="mt-2">
                      <Textarea
                        className="min-h-[72px] font-mono text-xs"
                        placeholder="Paste user UUIDs separated by comma, space, or newline"
                        aria-label="Paste user UUIDs"
                        value={form.userIdsText}
                        onChange={(e) => setForm((f) => ({ ...f, userIdsText: e.target.value }))}
                      />
                      <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Parsed: {pastedUserIds.length} extra ID(s) — merged with picker selection.
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="2. Message">
            <div>
              <Label>Category (opt-out respected)</Label>
              <div className="mt-2" role="group" aria-label="Category">
                <PillGroup>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <Pill
                      key={opt.value}
                      active={form.category === opt.value}
                      onClick={() => setForm((f) => ({ ...f, category: opt.value }))}
                    >
                      {opt.label}
                    </Pill>
                  ))}
                </PillGroup>
              </div>
              <div className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{categoryOption?.hint}</div>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="broadcast-title">Title</Label>
                <span className="text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">{form.title.length}/80</span>
              </div>
              <TextInput
                id="broadcast-title"
                className="mt-1"
                maxLength={80}
                placeholder="e.g. New feature: Study streaks"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="broadcast-body">Body</Label>
                <span className="text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">{form.body.length}/240</span>
              </div>
              <Textarea
                id="broadcast-body"
                className="mt-1 min-h-[88px] text-sm"
                maxLength={240}
                placeholder="e.g. Tap to see how it works"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
            </div>
          </Panel>

          <Panel title="3. Open a screen on tap" description="Optional.">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label htmlFor="broadcast-route">Deep link</Label>
                <TextInput
                  id="broadcast-route"
                  className="mt-1"
                  placeholder="/community or /community/settings"
                  value={form.route}
                  onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
                />
                {routeInvalid ? (
                  <div className="mt-1 text-xs font-black text-rose-700 dark:text-rose-300">Route must start with “/”.</div>
                ) : (
                  <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Must start with <code className="font-mono">/</code>. Tap routes the user to this screen.
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="broadcast-params">Route params (JSON)</Label>
                <Textarea
                  id="broadcast-params"
                  className="mt-1 min-h-[60px] font-mono text-xs"
                  placeholder='{"tab":"shared"}'
                  value={form.paramsText}
                  onChange={(e) => setForm((f) => ({ ...f, paramsText: e.target.value }))}
                />
                {!parsedParams.ok ? (
                  <div className="mt-1 text-xs font-black text-rose-700 dark:text-rose-300">{parsedParams.error}</div>
                ) : null}
              </div>
            </div>
          </Panel>
        </div>

        {/* Right: check and send */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <Panel title="Review and send">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-slate-500 dark:text-slate-400">Audience</dt>
                <dd className="min-w-0 truncate text-right font-black text-slate-900 dark:text-slate-100" title={audienceSummary}>{audienceSummary}</dd>
              </div>
            </dl>

            <div className="mt-4">
              <StatItem
                label="Eligible recipients"
                value={preview ? preview.count.toLocaleString() : '—'}
                tone={preview ? 'success' : 'neutral'}
                hint={preview ? undefined : 'Press “Preview count” to check.'}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={runPreview} disabled={!canPreview || previewBusy}>
                {previewBusy ? 'Checking…' : 'Preview count'}
              </Button>
              <Button variant="primary" onClick={runSend} disabled={!canSend || sendBusy}>
                {sendBusy ? 'Sending…' : 'Send broadcast'}
              </Button>
            </div>

            {missing.length > 0 ? (
              <div className="mt-3 text-xs font-bold text-amber-700 dark:text-amber-300">To send: {missing.join(', ')}.</div>
            ) : null}

            <div className="mt-4 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Only users with <span className="font-black">expo_push_token</span> and{' '}
              <span className="font-black">community_push_enabled = true</span> are counted. Category preferences are
              additionally applied server-side.
            </div>
          </Panel>

          {previewErr ? <Notice tone="danger">{previewErr}</Notice> : null}
          {sendErr ? <Notice tone="danger">{sendErr}</Notice> : null}

          {sendResult?.queued ? (
            !finalLog ? (
              <Notice tone="info" title="Sending in the background">
                {preview?.count ? `To about ${preview.count.toLocaleString()} student(s). ` : ''}Big groups take 1–2 minutes. You can leave this page; it still sends. Don’t press Send again.
              </Notice>
            ) : finalLog.meta.phase === 'failed' ? (
              <Notice tone="danger" title="Sending stopped with an error">
                {String(finalLog.meta.error ?? 'unknown')}. Check the inbox count before trying again.
              </Notice>
            ) : (
              <Notice tone="success" title="Done">
                <div className="space-y-1 text-xs">
                  <div>In-app inbox: {Number(finalLog.meta.recipient_count ?? 0).toLocaleString()} student(s).</div>
                  <div>
                    Phone pop-ups: tried {Number(finalLog.meta.push_sent ?? 0).toLocaleString()} of {Number(finalLog.meta.push_recipient_count ?? 0).toLocaleString()} with push on · accepted {Number(finalLog.meta.push_accepted ?? 0).toLocaleString()}
                    {Number(finalLog.meta.push_failed ?? 0) ? ` · failed ${Number(finalLog.meta.push_failed).toLocaleString()}` : ''}.
                  </div>
                  {Number(finalLog.meta.push_failed ?? 0) ? (
                    <div className="text-rose-700 dark:text-rose-300">
                      Why they failed: {Object.entries((finalLog.meta.push_failed_reasons ?? {}) as Record<string, number>).map(([k, n]) => `${TICKET_REASON[k] ?? k} (${n})`).join(', ')}
                    </div>
                  ) : null}
                </div>
              </Notice>
            )
          ) : sendResult ? (() => {
            const tickets = summarizeTickets(sendResult.results);
            const reason = sendResult.reason === 'no_push_recipients' || sendResult.reason === 'no_eligible_tokens'
              ? 'No pop-ups: nobody in this audience has push notifications allowed for Rencana on their phone (or they turned this kind off).'
              : sendResult.reason === 'no_recipients' ? 'Nobody matched this audience.' : '';
            return (
              <Notice tone="success">
                <div className="space-y-1 text-xs">
                  {typeof sendResult.in_app_recipients === 'number' ? <div>In-app inbox: {sendResult.in_app_recipients.toLocaleString()} student(s).</div> : null}
                  <div>
                    Phone pop-ups: tried {(sendResult.sent ?? 0).toLocaleString()}
                    {typeof sendResult.push_recipients === 'number' ? ` of ${sendResult.push_recipients.toLocaleString()} with push on` : ''}
                    {tickets ? ` · accepted ${tickets.ok.toLocaleString()}${tickets.failed ? ` · failed ${tickets.failed.toLocaleString()}` : ''}` : ''}.
                  </div>
                  {tickets && tickets.failed ? (
                    <div className="text-rose-700 dark:text-rose-300">
                      Why they failed: {Object.entries(tickets.reasons).map(([k, n]) => `${TICKET_REASON[k] ?? k} (${n})`).join(', ')}
                    </div>
                  ) : null}
                  {reason ? <div className="text-amber-700 dark:text-amber-300">{reason}</div> : null}
                  <div className="font-normal opacity-80">“Accepted” means Apple/Google took it. A phone still won’t show it if Rencana notifications are off in the phone’s settings.</div>
                </div>
              </Notice>
            );
          })() : null}
        </div>
      </div>
    </div>
  );
}
