import { useEffect, useMemo, useState } from 'react';
import {
  listUniversities,
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
import { MotionPanel, MotionSection } from '../ui/motion';

const CATEGORY_OPTIONS: Array<{ value: BroadcastCategory; label: string; hint: string }> = [
  { value: 'reaction', label: 'Reaction (default)', hint: 'Respects push_reactions_enabled' },
  { value: 'shared_task', label: 'Shared task', hint: 'Respects push_shared_task_enabled' },
  { value: 'circle', label: 'Circle', hint: 'Respects push_circle_enabled' },
  { value: 'friend', label: 'Friend', hint: 'Respects push_friend_requests_enabled' },
];

type FormState = {
  audience: BroadcastAudience;
  universityId: string;
  userIdsText: string;
  title: string;
  body: string;
  category: BroadcastCategory;
  route: string;
  paramsText: string;
};

const USER_PAGE_SIZE = 25;

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
        universityId: form.audience === 'university' ? form.universityId : undefined,
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
        universityId: form.audience === 'university' ? form.universityId : undefined,
        userIds: form.audience === 'user_ids' ? mergedUserIds : undefined,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        route: route || undefined,
        params: Object.keys(params).length > 0 ? params : undefined,
      });
      setSendResult(res);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSendBusy(false);
    }
  };

  return (
    <div>
      <MotionSection>
        <div className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Broadcast</div>
        <div className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
          Send a push notification to users. Respects each user’s community push opt-in and category preferences.
        </div>
      </MotionSection>

      <MotionSection delay={0.05} className="mt-6">
        <MotionPanel>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <Label>Audience</Label>
                <Select
                  className="mt-1"
                  value={form.audience}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, audience: e.target.value as BroadcastAudience, userIdsText: f.userIdsText }))
                  }
                >
                  <option value="all">Everyone (all users with push enabled)</option>
                  <option value="university">By university</option>
                  <option value="user_ids">Select specific users</option>
                </Select>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {form.audience === 'all'
                    ? 'Sends to every eligible user.'
                    : form.audience === 'university'
                      ? 'Sends to everyone at the selected university.'
                      : 'Pick individuals or “Select all matching” in the list below.'}
                </div>
              </div>

              <div>
                <Label>Category (opt-out respected)</Label>
                <Select
                  className="mt-1"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BroadcastCategory }))}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {CATEGORY_OPTIONS.find((o) => o.value === form.category)?.hint}
                </div>
              </div>
            </div>

            {form.audience === 'university' ? (
              <div className="mt-5">
                <Label>University</Label>
                <Select
                  className="mt-1"
                  value={form.universityId}
                  onChange={(e) => setForm((f) => ({ ...f, universityId: e.target.value }))}
                >
                  <option value="">— select a university —</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            {form.audience === 'user_ids' ? (
              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <Label>Pick users</Label>
                  <div className="text-xs font-black text-slate-600 dark:text-slate-300">
                    {selectedUsers.size} selected
                    {selectedUsers.size > 0 ? (
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="ml-2 font-semibold text-rose-600 hover:underline dark:text-rose-300"
                      >
                        clear
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_minmax(160px,240px)]">
                  <TextInput
                    placeholder="Search by name or student ID"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  />
                  <Select
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

                {/* Selected chips */}
                {selectedUsers.size > 0 ? (
                  <div className="mt-3 flex max-h-28 flex-wrap gap-1.5 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950/40">
                    {Array.from(selectedUsers.values()).map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-1 text-xs font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
                      >
                        {userLabel(u)}
                        <button
                          type="button"
                          onClick={() => togglePickerUser(u)}
                          className="rounded-full px-1 text-brand-700/70 hover:bg-brand-500/20 hover:text-brand-800 dark:text-brand-200/70 dark:hover:text-brand-100"
                          aria-label={`Remove ${userLabel(u)}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Picker list */}
                <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
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
                      className="rounded-full bg-white px-3 py-1 font-black text-brand-700 shadow-sm hover:bg-brand-50 disabled:opacity-40 dark:bg-slate-900 dark:text-brand-200 dark:hover:bg-brand-500/10"
                      disabled={pickerBusy || pickerTotal === 0}
                      title="Add every user matching your current search + university filter to the selection (max 1,000)."
                    >
                      + Select all matching ({pickerTotal.toLocaleString()})
                    </button>
                  </div>

                  <div className="max-h-80 overflow-auto">
                    {pickerBusy && pickerItems.length === 0 ? (
                      <div className="p-4 text-center text-xs font-semibold text-slate-500">Loading…</div>
                    ) : pickerItems.length === 0 ? (
                      <div className="p-4 text-center text-xs font-semibold text-slate-500">No users match.</div>
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
                                    {u.name ?? <span className="italic text-slate-400">(no name)</span>}
                                  </div>
                                  <div className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                    {u.student_id ?? '—'} · {u.id.slice(0, 8)}…
                                  </div>
                                </div>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                    u.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
                                      : 'bg-slate-200 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300'
                                  }`}
                                >
                                  {u.status}
                                </span>
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
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                          onClick={() => setPickerPage((p) => Math.max(0, p - 1))}
                          disabled={pickerPage === 0 || pickerBusy}
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900"
                          onClick={() => setPickerPage((p) => p + 1)}
                          disabled={(pickerPage + 1) * USER_PAGE_SIZE >= pickerTotal || pickerBusy}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {pickerErr ? (
                  <div className="mt-2 text-xs font-black text-rose-600 dark:text-rose-300">{pickerErr}</div>
                ) : null}

                {/* Advanced: paste raw UUIDs */}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowPasteBox((v) => !v)}
                    className="text-xs font-bold text-slate-500 hover:underline dark:text-slate-400"
                  >
                    {showPasteBox ? '− Hide' : '+ Advanced'}: paste user UUIDs
                  </button>
                  {showPasteBox ? (
                    <div className="mt-2">
                      <Textarea
                        className="min-h-[72px] font-mono text-xs"
                        placeholder="Paste user UUIDs separated by comma, space, or newline"
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

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <Label>Title</Label>
                <TextInput
                  className="mt-1"
                  maxLength={80}
                  placeholder="e.g. New feature: Study streaks"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {form.title.length}/80
                </div>
              </div>

              <div>
                <Label>Body</Label>
                <Textarea
                  className="mt-1 min-h-[60px]"
                  maxLength={240}
                  placeholder="e.g. Tap to see how it works"
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {form.body.length}/240
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <Label>Deep link (optional)</Label>
                <TextInput
                  className="mt-1"
                  placeholder="/community or /community/settings"
                  value={form.route}
                  onChange={(e) => setForm((f) => ({ ...f, route: e.target.value }))}
                />
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Must start with <code className="font-mono">/</code>. Tap routes the user to this screen.
                </div>
                {routeInvalid ? (
                  <div className="mt-1 text-xs font-black text-rose-600 dark:text-rose-300">
                    Route must start with “/”.
                  </div>
                ) : null}
              </div>

              <div>
                <Label>Route params (optional JSON)</Label>
                <Textarea
                  className="mt-1 min-h-[60px] font-mono text-xs"
                  placeholder='{"tab":"shared"}'
                  value={form.paramsText}
                  onChange={(e) => setForm((f) => ({ ...f, paramsText: e.target.value }))}
                />
                {!parsedParams.ok ? (
                  <div className="mt-1 text-xs font-black text-rose-600 dark:text-rose-300">{parsedParams.error}</div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Only users with <span className="font-black">expo_push_token</span> and{' '}
                <span className="font-black">community_push_enabled = true</span> are counted. Category preferences are
                additionally applied server-side.
              </div>

              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={runPreview} disabled={!canPreview || previewBusy}>
                  {previewBusy ? 'Checking…' : 'Preview count'}
                </Button>
                <Button variant="primary" onClick={runSend} disabled={!canSend || sendBusy}>
                  {sendBusy ? 'Sending…' : 'Send broadcast'}
                </Button>
              </div>
            </div>

            {previewErr ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {previewErr}
              </div>
            ) : null}
            {preview ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-black text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                Eligible recipients: {preview.count.toLocaleString()}
              </div>
            ) : null}

            {sendErr ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-100">
                {sendErr}
              </div>
            ) : null}
            {sendResult ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100">
                Sent {sendResult.sent ?? 0} push(es)
                {typeof sendResult.batches === 'number' ? ` in ${sendResult.batches} batch(es)` : ''}
                {sendResult.reason ? ` — ${sendResult.reason}` : ''}.
              </div>
            ) : null}
          </div>
        </MotionPanel>
      </MotionSection>
    </div>
  );
}
