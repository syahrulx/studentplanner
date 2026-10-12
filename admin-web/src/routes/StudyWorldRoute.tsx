import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ItemsPanel } from '../components/studyWorld/ItemsPanel';
import { PaymentsPanel } from '../components/studyWorld/PaymentsPanel';
import { BansPanel, PlayersPanel } from '../components/studyWorld/PlayersPanel';
import { ReportsPanel } from '../components/studyWorld/ReportsPanel';
import { ChatFilterPanel } from '../components/studyWorld/ChatFilterPanel';
import { LogPanel, OverviewPanel, SettingsPanel } from '../components/studyWorld/SettingsPanels';
import { MapsRoomsPanel } from '../components/studyWorld/MapsRoomsPanel';
import { LeaderboardsPanel, WalletsPanel } from '../components/studyWorld/EconomyPanels';
import { useLiveCounts } from '../lib/studyWorld';
import { useWorldAlerts } from '../lib/studyWorldAlerts';

type View = { id: string; label: string; badge?: number; content: ReactNode };
type Section = { id: string; label: string; hint: string; badge?: number; views: View[] };

/** Old single-level tab ids, so existing links (?tab=reports) still land in the right place. */
const OLD_TABS: Record<string, [string, string]> = {
  overview: ['home', 'home'],
  items: ['shop', 'items'],
  payments: ['shop', 'payments'],
  wallets: ['shop', 'wallets'],
  leaderboards: ['shop', 'leaderboards'],
  maps: ['world', 'maps'],
  settings: ['world', 'settings'],
  players: ['players', 'players'],
  bans: ['players', 'bans'],
  reports: ['safety', 'reports'],
  chat: ['safety', 'chat'],
  log: ['log', 'log'],
};

function Badge({ n, tone = 'rose' }: { n?: number; tone?: 'rose' | 'slate' }) {
  if (!n) return null;
  return (
    <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${tone === 'rose' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** Study World (Rencana website /app/world): six areas, each with a few views. */
export function StudyWorldRoute() {
  const [params, setParams] = useSearchParams();
  const alerts = useWorldAlerts();
  const live = useLiveCounts();

  const go = (tab: string) => {
    const [section, view] = OLD_TABS[tab] ?? [tab, ''];
    const next = new URLSearchParams();
    next.set('s', section);
    if (view) next.set('v', view);
    setParams(next, { replace: true });
  };

  const sections: Section[] = [
    { id: 'home', label: 'Home', hint: 'What needs you today', views: [{ id: 'home', label: 'Home', content: <OverviewPanel onGo={go} /> }] },
    {
      id: 'safety',
      label: 'Safety',
      hint: 'Reports from players and the chat word filter',
      badge: alerts.openReports + alerts.pendingWords,
      views: [
        { id: 'reports', label: 'Reports', badge: alerts.openReports, content: <ReportsPanel /> },
        { id: 'chat', label: 'Chat words', badge: alerts.pendingWords, content: <ChatFilterPanel /> },
      ],
    },
    {
      id: 'players',
      label: 'Players',
      hint: 'Find a player, see their avatar and account, ban or fix',
      views: [
        { id: 'players', label: 'All players', content: <PlayersPanel /> },
        { id: 'bans', label: 'Bans', badge: alerts.activeBans, content: <BansPanel /> },
      ],
    },
    {
      id: 'shop',
      label: 'Shop',
      hint: 'Items and prices, players’ coins and fish, and leaderboards',
      views: [
        { id: 'items', label: 'Items', content: <ItemsPanel /> },
        { id: 'wallets', label: 'Wallets & bags', content: <WalletsPanel /> },
        { id: 'leaderboards', label: 'Leaderboards', content: <LeaderboardsPanel /> },
        { id: 'payments', label: 'Coin packs & prices (demo)', content: <PaymentsPanel /> },
      ],
    },
    {
      id: 'world',
      label: 'World',
      hint: 'Maps, rooms, who is inside, and open/close switches',
      badge: live.total,
      views: [
        { id: 'maps', label: 'Maps & rooms', content: <MapsRoomsPanel /> },
        { id: 'settings', label: 'Switches', content: <SettingsPanel /> },
      ],
    },
    { id: 'log', label: 'Log', hint: 'Every admin change', views: [{ id: 'log', label: 'Log', content: <LogPanel /> }] },
  ];

  const legacy = OLD_TABS[params.get('tab') ?? ''];
  const sectionId = params.get('s') ?? legacy?.[0] ?? 'home';
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const viewId = params.get('v') ?? legacy?.[1];
  const view = section.views.find((v) => v.id === viewId) ?? section.views[0];

  const choose = (s: Section, v?: View) => {
    const next = new URLSearchParams();
    if (s.id !== 'home') next.set('s', s.id);
    if (v && v.id !== s.views[0].id) next.set('v', v.id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">Study World</h1>
          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{section.hint}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          <span className={`h-2 w-2 rounded-full ${live.connected ? (live.total ? 'bg-emerald-500' : 'bg-slate-300') : 'bg-amber-400'}`} />
          {live.connected ? `${live.total} in the world now` : 'Connecting…'}
        </span>
      </div>

      <nav className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label="Study World sections">
        {sections.map((s) => {
          const active = s.id === section.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => choose(s)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center justify-center rounded-2xl border px-3 py-3 text-sm font-black transition ${
                active
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {s.label}
              <Badge n={s.badge} tone={s.id === 'world' ? 'slate' : 'rose'} />
            </button>
          );
        })}
      </nav>

      {section.views.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {section.views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => choose(section, v)}
              className={`rounded-xl px-3 py-1.5 text-xs font-black transition ${
                v.id === view.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {v.label}
              <Badge n={v.badge} />
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200/80 bg-slate-50/70 p-1 dark:border-slate-800 dark:bg-slate-950/30">
        {view.content}
      </div>
    </div>
  );
}
