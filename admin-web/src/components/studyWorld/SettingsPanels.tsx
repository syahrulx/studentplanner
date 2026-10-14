import { useCallback, useEffect, useState } from 'react';
import {
  getWorldOverview,
  getWorldSettings,
  listWorldLog,
  saveWorldSettings,
  useLiveCounts,
  type WorldLogEntry,
  type WorldOverview,
  type WorldSettings,
} from '../../lib/studyWorld';
import { useWorldAlerts } from '../../lib/studyWorldAlerts';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox, Field, Stat, Toggle } from './ui';

export function OverviewPanel({ onGo }: { onGo: (tab: string) => void }) {
  const live = useLiveCounts();
  const [data, setData] = useState<WorldOverview | null>(null);
  const [settings, setSettings] = useState<WorldSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [o, s] = await Promise.all([getWorldOverview(), getWorldSettings()]);
        setData(o);
        setSettings(s);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load overview.');
      }
    })();
  }, []);

  const alerts = useWorldAlerts();
  const todo = [
    { n: alerts.openReports, label: 'reports to check', go: 'reports', tone: 'rose' },
    { n: alerts.pendingWords, label: 'chat words to mark safe or blocked', go: 'chat', tone: 'rose' },
  ].filter((t) => t.n > 0);

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      {settings && !settings.world_open ? (
        <button type="button" onClick={() => onGo('settings')} className="block w-full rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left text-sm font-bold text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          RenTaman is CLOSED for players. {settings.closed_message ? `Message: “${settings.closed_message}”` : ''} <span className="underline">Change →</span>
        </button>
      ) : null}

      <section className={`${CARD} p-5`}>
        <div className="text-sm font-black text-slate-900 dark:text-white">To do</div>
        {todo.length === 0 ? (
          <p className="mt-2 text-sm font-semibold text-emerald-600">Nothing waiting. All reports and chat words are handled.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {todo.map((t) => (
              <button key={t.go} type="button" onClick={() => onGo(t.go)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-bold text-rose-900 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
                <span className="grid h-8 min-w-8 place-items-center rounded-full bg-rose-600 px-2 text-sm font-black text-white">{t.n}</span>
                {t.label}
                <span className="ml-auto">Open →</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="In RenTaman now" value={live.connected ? live.total : '—'} hint={live.connected ? 'Live · real people only' : 'Connecting…'} />
        <Stat label="Players with an avatar" value={data?.players ?? '—'} hint={data ? `${data.players_7d} saved in the last 7 days` : undefined} />
        <Stat label="Banned now" value={data?.active_bans ?? '—'} tone="rose" />
        <Stat label="Items on sale" value={data?.items_available ?? '—'} hint={data ? `${data.items_coming_soon} coming soon · ${data.items_hidden} hidden` : undefined} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['players', 'Find a player'],
          ['items', 'Edit shop items'],
          ['maps', 'Maps & rooms'],
          ['settings', 'Open / close the world'],
        ].map(([go, label]) => (
          <button key={go} type="button" className={`${CARD} p-4 text-left text-sm font-black hover:border-slate-300`} onClick={() => onGo(go)}>{label} →</button>
        ))}
      </div>

      <details className={`${CARD} p-5 text-sm font-semibold text-slate-600 dark:text-slate-300`}>
        <summary className="cursor-pointer font-black text-slate-900 dark:text-white">How this connects to the website</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Items, prices, maps, coin packs, switches and chat words are read by the Rencana website’s RenTaman page. Changes reach players within seconds.</li>
          <li>Bans are checked when a player opens RenTaman. A banned player sees the reason and cannot enter.</li>
          <li>Rooms are still simulated on the website (no real multiplayer yet), so reports name a nickname, not an account. Match it in the report before banning.</li>
          <li>“In the world now” counts real open tabs inside a room. Each tab sends only its map, room and room type — never who it is, and never a private room’s code. The simulated bots are not counted.</li>
          <li>Coins and unlocked items live only in each player’s browser until real payments are added.</li>
        </ul>
      </details>
    </div>
  );
}

export function SettingsPanel() {
  const [s, setS] = useState<WorldSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setS(await getWorldSettings());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load settings.');
      }
    })();
  }, []);

  if (!s) return <div className="p-4"><ErrorBox message={error} />{!error ? <div className="p-8 text-center text-sm text-slate-400">Loading…</div> : null}</div>;
  const set = <K extends keyof WorldSettings>(k: K, v: WorldSettings[K]) => { setSaved(false); setS({ ...s, [k]: v }); };

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      const { updated_at: _ignored, ...rest } = s;
      void _ignored;
      await saveWorldSettings({
        ...rest,
        closed_message: rest.closed_message?.trim() || null,
        announcement: rest.announcement?.trim() || null,
      });
      setSaved(true);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <div className={`${CARD} space-y-3 p-5`}>
        <Toggle checked={s.world_open} onChange={(v) => set('world_open', v)} label="World is open" hint="Turn off for maintenance or emergencies. Players see the message below instead of the world." />
        <Field label="Message when closed">
          <input value={s.closed_message ?? ''} maxLength={300} onChange={(e) => set('closed_message', e.target.value)} placeholder="RenTaman is having a quick tune-up. Back soon!" className={FIELD} />
        </Field>
        <Toggle checked={s.shop_enabled} onChange={(v) => set('shop_enabled', v)} label="Shop open" hint="When off, players can still change into items they own, but cannot unlock new ones." />
        <Toggle checked={s.chat_enabled} onChange={(v) => set('chat_enabled', v)} label="Room chat on" hint="When off, only emotes work." />
        <Toggle checked={s.reports_enabled} onChange={(v) => set('reports_enabled', v)} label="Players can send reports" />
        <div className="grid gap-3">
          <Field label="Announcement banner (optional)" hint="New players start with 0 coins. Coins now live on the server: give or take them from a player's Wallet & bag.">
            <input value={s.announcement ?? ''} maxLength={300} onChange={(e) => set('announcement', e.target.value)} placeholder="New: Cat ears in the shop!" className={FIELD} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className={BTN_DARK} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save settings'}</button>
          {saved ? <span className="text-sm font-bold text-emerald-600">Saved. Players get it on their next load.</span> : null}
          <span className="ml-auto text-xs text-slate-400">Last changed {when(s.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function LogPanel() {
  const [rows, setRows] = useState<WorldLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listWorldLog(200));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load log.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <div className="flex justify-end"><button type="button" className={BTN_LIGHT} onClick={() => void load()}>Refresh</button></div>
      <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
        {rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">No admin activity yet.</div> : rows.map((r) => (
          <div key={r.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{r.action}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{r.target || r.target_user_id || ''}</span>
              <span className="ml-auto text-xs text-slate-400">{r.admin_email || 'system'} · {when(r.created_at)}</span>
            </div>
            {r.reason ? <div className="mt-1 text-slate-500">{r.reason}</div> : null}
            {Object.keys(r.details ?? {}).length ? (
              <button type="button" className="mt-1 text-xs font-bold text-brand-600" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide details' : 'Details'}</button>
            ) : null}
            {open === r.id ? <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-[11px] dark:bg-slate-950">{JSON.stringify(r.details, null, 2)}</pre> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

