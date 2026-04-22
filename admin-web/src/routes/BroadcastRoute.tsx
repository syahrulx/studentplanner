import { useEffect, useMemo, useState } from 'react';
import {
  listUniversities,
  previewBroadcast,
  sendBroadcast,
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

function parseUserIds(raw: string): string[] {
  return raw
    .split(/[\s,;\n]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
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

  const parsedUserIds = useMemo(() => parseUserIds(form.userIdsText), [form.userIdsText]);
  const parsedParams = useMemo(() => parseParams(form.paramsText), [form.paramsText]);

  const canPreview =
    form.audience === 'all' ||
    (form.audience === 'university' && !!form.universityId) ||
    (form.audience === 'user_ids' && parsedUserIds.length > 0);

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
        userIds: form.audience === 'user_ids' ? parsedUserIds : undefined,
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
    if (
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
        userIds: form.audience === 'user_ids' ? parsedUserIds : undefined,
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
                  <option value="all">All users (with push enabled)</option>
                  <option value="university">By university</option>
                  <option value="user_ids">Specific user IDs</option>
                </Select>
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
                <Label>User IDs</Label>
                <Textarea
                  className="mt-1 min-h-[100px] font-mono text-xs"
                  placeholder="Paste user UUIDs separated by comma, space, or newline"
                  value={form.userIdsText}
                  onChange={(e) => setForm((f) => ({ ...f, userIdsText: e.target.value }))}
                />
                <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Parsed: {parsedUserIds.length} ID(s)
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
