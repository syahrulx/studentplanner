import { useCallback, useEffect, useState } from 'react';
import { hasMapArt, listWorldMaps, saveWorldMap, useLiveCounts, type ItemStatus, type WorldMap } from '../../lib/studyWorld';
import { MapPreview } from './WorldArt';
import { CARD, FIELD } from './format';
import { ErrorBox, StatusBadge } from './ui';

/**
 * The rooms the website offers per map. Mirrors serversFor() in the website's
 * src/lib/study-world/rooms.ts: three open rooms and two Pro lounges, named
 * after the map. Private rooms are left out on purpose (the website does not
 * announce them). Each room holds at most 50 people.
 */
const ROOM_LIMIT = 50;
const roomsFor = (mapName: string) => ({
  open: [1, 2, 3].map((n) => `${mapName} ${n}`),
  pro: [1, 2].map((n) => `${mapName} Pro lounge ${n}`),
});

function RoomRow({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className={`h-2 w-2 shrink-0 rounded-full ${count ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{name}</span>
      <span className="ml-auto shrink-0 tabular-nums text-xs font-black text-slate-900 dark:text-white">
        {count}<span className="font-semibold text-slate-400">/{ROOM_LIMIT}</span>
      </span>
    </div>
  );
}

export function MapsRoomsPanel() {
  const live = useLiveCounts();
  const [maps, setMaps] = useState<WorldMap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMaps(await listWorldMaps());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load maps.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function patch(map: WorldMap, change: Partial<WorldMap>) {
    const next = { ...map, ...change };
    if (next.status === 'available' && !hasMapArt(next.map_key)) {
      setError(`The website has no "${next.map_key}" map built yet, so it can only be "coming soon".`);
      return;
    }
    setBusy(map.map_key);
    try {
      const { updated_at: _ignored, ...row } = next;
      void _ignored;
      await saveWorldMap(row, false);
      setMaps((all) => all.map((m) => (m.map_key === map.map_key ? next : m)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save map.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <p className="px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
        Live numbers are real people with Study World open in that room. The website still shows made-up numbers to players until real multiplayer is built.
        {live.connected ? '' : ' Connecting to the live count…'}
      </p>
      {maps.map((m) => {
        const counts = live.byMap[m.map_key]?.rooms ?? {};
        const { open, pro } = roomsFor(m.name);
        // Any live room not in the standard list (e.g. the map was renamed while people were inside).
        const known = new Set([...open, ...pro]);
        const extra = Object.keys(counts).filter((r) => !known.has(r) && !/^private room/i.test(r));
        const total = [...open, ...pro, ...extra].reduce((sum, r) => sum + (counts[r] ?? 0), 0);
        const off = m.status !== 'available';
        return (
          <section key={m.map_key} className={`${CARD} grid overflow-hidden md:grid-cols-[320px_1fr]`}>
            <div className="relative border-b border-slate-200 md:border-b-0 md:border-r dark:border-slate-800">
              <MapPreview mapKey={m.map_key} className={`h-56 md:h-full ${off ? 'opacity-50 grayscale' : ''}`} />
              <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-black text-white">
                {total} {total === 1 ? 'person' : 'people'} now
              </span>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-lg font-black text-slate-900 dark:text-white">{m.name}</div>
                <StatusBadge status={m.status} />
                {m.pro_only ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Pro only</span> : null}
                <div className="ml-auto flex items-center gap-2">
                  <select value={m.status} disabled={busy === m.map_key} onChange={(e) => void patch(m, { status: e.target.value as ItemStatus })} className={`${FIELD} h-8 w-auto text-xs`} aria-label={`${m.name} status`}>
                    <option value="available">Open</option>
                    <option value="coming_soon">Coming soon</option>
                    <option value="hidden">Hidden</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={m.pro_only} disabled={busy === m.map_key} onChange={(e) => void patch(m, { pro_only: e.target.checked })} className="h-4 w-4 accent-slate-900" /> Pro only
                  </label>
                </div>
              </div>
              {m.description ? <div className="-mt-2 text-xs font-semibold text-slate-500">{m.description}</div> : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-slate-400">Open world</div>
                  {open.map((r) => <RoomRow key={r} name={r} count={counts[r] ?? 0} />)}
                  {extra.filter((r) => !/pro lounge/i.test(r)).map((r) => <RoomRow key={r} name={r} count={counts[r] ?? 0} />)}
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-black uppercase tracking-wider text-violet-500">Pro lounges</div>
                  {pro.map((r) => <RoomRow key={r} name={r} count={counts[r] ?? 0} />)}
                  {extra.filter((r) => /pro lounge/i.test(r)).map((r) => <RoomRow key={r} name={r} count={counts[r] ?? 0} />)}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
