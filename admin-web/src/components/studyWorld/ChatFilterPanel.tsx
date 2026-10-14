import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CHAT_WORD_CATEGORIES,
  deleteChatWord,
  listChatWords,
  saveChatWord,
  type ChatWord,
  type ChatWordCategory,
  type ChatWordStatus,
} from '../../lib/studyWorld';
import { BUILT_IN_WORDS, filterChat, normalizeRaw, setAdminWords } from '../../vendor/study-world/chat-filter';
import { BTN_DARK, BTN_LIGHT, CARD, FIELD, when } from './format';
import { ErrorBox } from './ui';

type View = 'pending' | 'blocked' | 'safe' | 'builtin';

const VIEW_LABEL: Record<View, string> = {
  pending: 'To review',
  blocked: 'Blocked',
  safe: 'Marked safe',
  builtin: 'Built-in list',
};

/**
 * The Study World chat filter. The website hides bad words and contact details
 * on its own; words it is unsure about land here as "To review". Blocking adds
 * a word to the filter, marking safe lets it through (and can override the
 * built-in list). Changes reach players within seconds.
 */
export function ChatFilterPanel() {
  const [rows, setRows] = useState<ChatWord[]>([]);
  const [view, setView] = useState<View>('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Record<string, ChatWordCategory>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listChatWords());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the word list.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Keep the test box filtering exactly like the world does with today's list.
  useEffect(() => { setAdminWords(rows); }, [rows]);

  async function decide(word: string, status: ChatWordStatus, cat: ChatWordCategory | null) {
    setBusy(word);
    try {
      const existing = rows.find((r) => r.word === word);
      await saveChatWord(word, status, status === 'safe' ? null : cat, existing?.note ?? null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(null);
    }
  }

  async function remove(word: string) {
    setBusy(word);
    try {
      await deleteChatWord(word);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove.');
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'pending').length,
    blocked: rows.filter((r) => r.status === 'blocked').length,
    safe: rows.filter((r) => r.status === 'safe').length,
    builtin: BUILT_IN_WORDS.blocked.length,
  }), [rows]);
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => r.status === view && (!q || r.word.includes(q)))
    .sort((a, b) => (view === 'pending' ? b.hits - a.hits : 0));
  const decided = new Map(rows.map((r) => [r.word, r.status]));

  return (
    <div className="space-y-4 p-4">
      <ErrorBox message={error} />
      <div className={`${CARD} p-4 text-sm font-semibold text-slate-600 dark:text-slate-300`}>
        The world hides clearly bad words (as ****) and contact details — phone numbers, emails, links,
        Instagram/TikTok/Telegram handles — (as [hidden]) by itself. Words it is <b>unsure</b> about are hidden too and
        listed under <b>To review</b>. Only the single word is stored: never who wrote it or the message.
      </div>

      <TestBox />
      <AddWord onSaved={load} />

      <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
        {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)}
            className={`rounded-xl px-3 py-1.5 text-xs font-black ${view === v ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
            {VIEW_LABEL[v]} <span className="opacity-60">{counts[v]}</span>
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search words" className={`${FIELD} ml-auto w-48`} />
      </div>

      {view === 'builtin' ? (
        <div className={`${CARD} p-4`}>
          <p className="text-xs font-semibold text-slate-500">
            Always blocked by the website code. If one is hiding a normal word, mark it safe — that overrides the code.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BUILT_IN_WORDS.blocked.filter((w) => !q || w.includes(q)).map((w) => {
              const isSafe = decided.get(w) === 'safe';
              return (
                <span key={w} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-xs font-bold ${isSafe ? 'border-emerald-300 text-emerald-700 line-through dark:text-emerald-300' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>
                  {w}
                  {isSafe ? (
                    <button type="button" className="ml-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-700" disabled={busy === w} onClick={() => void remove(w)}>undo</button>
                  ) : (
                    <button type="button" className="ml-1 text-[10px] font-black uppercase text-slate-400 hover:text-emerald-600" disabled={busy === w} onClick={() => void decide(w, 'safe', null)}>safe</button>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ) : loading ? (
        <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>Loading…</div>
      ) : shown.length === 0 ? (
        <div className={`${CARD} p-8 text-center text-sm font-semibold text-slate-400`}>
          {view === 'pending' ? 'Nothing to review. 🎉' : 'No words here.'}
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-slate-100 dark:divide-slate-800`}>
          {shown.map((r) => (
            <div key={r.word} className="flex flex-wrap items-center gap-3 p-3">
              <span className="min-w-28 font-mono text-base font-black text-slate-900 dark:text-white">{r.word}</span>
              <span className="text-xs font-semibold text-slate-400">
                {view === 'pending'
                  ? `seen ${r.hits}× · last ${when(r.last_seen)}`
                  : `${r.category ?? '—'} · decided ${when(r.reviewed_at)}`}
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {r.status !== 'safe' ? (
                  <select
                    value={category[r.word] ?? r.category ?? 'profanity'}
                    onChange={(e) => setCategory((c) => ({ ...c, [r.word]: e.target.value as ChatWordCategory }))}
                    className={`${FIELD} h-8 w-32`}
                    aria-label={`Category for ${r.word}`}
                  >
                    {CHAT_WORD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : null}
                {r.status !== 'safe' ? (
                  <button type="button" className={`${BTN_LIGHT} h-8`} disabled={busy === r.word} onClick={() => void decide(r.word, 'safe', null)}>Mark safe</button>
                ) : null}
                {r.status !== 'blocked' ? (
                  <button type="button" className={`${BTN_DARK} h-8`} disabled={busy === r.word}
                    onClick={() => void decide(r.word, 'blocked', category[r.word] ?? r.category ?? 'profanity')}>Block</button>
                ) : (
                  <button type="button" className={`${BTN_LIGHT} h-8`} disabled={busy === r.word}
                    onClick={() => void decide(r.word, 'blocked', category[r.word] ?? r.category ?? 'profanity')}>Save category</button>
                )}
                {r.status !== 'pending' ? (
                  <button type="button" className={`${BTN_LIGHT} h-8`} disabled={busy === r.word} onClick={() => void remove(r.word)} title="Back to the website's own rules">Remove</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Type a message and see exactly what players would see. */
function TestBox() {
  const [text, setText] = useState('');
  const result = text.trim() ? filterChat(text) : null;
  return (
    <div className={`${CARD} space-y-2 p-4`}>
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Test a message</div>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="e.g. add me on ig muhd.izwan" className={FIELD} />
      {result ? (
        <div className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-950/50">
          <div className="font-semibold text-slate-900 dark:text-white">Players see: “{result.text}”</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {[
              result.censored ? 'words hidden' : null,
              result.contactHidden ? 'contact details hidden' : null,
              result.review.length ? `sent for review: ${result.review.join(', ')}` : null,
            ].filter(Boolean).join(' · ') || 'nothing hidden'}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddWord({ onSaved }: { onSaved: () => Promise<void> }) {
  const [word, setWord] = useState('');
  const [status, setStatus] = useState<'blocked' | 'safe'>('blocked');
  const [cat, setCat] = useState<ChatWordCategory>('profanity');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const norm = normalizeRaw(word);

  async function save() {
    if (!/^\p{L}{2,40}$/u.test(norm)) {
      setError('Use one word of 2–40 letters.');
      return;
    }
    setBusy(true);
    try {
      await saveChatWord(norm, status, status === 'blocked' ? cat : null, null);
      setWord('');
      setError(null);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${CARD} space-y-2 p-4`}>
      <div className="text-[11px] font-black uppercase tracking-wide text-slate-600 dark:text-slate-300">Add a word</div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="One word" className={`${FIELD} w-48 font-mono`} />
        <select value={status} onChange={(e) => setStatus(e.target.value as 'blocked' | 'safe')} className={`${FIELD} w-32`}>
          <option value="blocked">Block</option>
          <option value="safe">Mark safe</option>
        </select>
        {status === 'blocked' ? (
          <select value={cat} onChange={(e) => setCat(e.target.value as ChatWordCategory)} className={`${FIELD} w-36`}>
            {CHAT_WORD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        <button type="button" className={BTN_DARK} disabled={busy || !norm} onClick={() => void save()}>Save</button>
        {word && norm !== word.toLowerCase() ? <span className="text-xs font-semibold text-slate-400">saved as “{norm}”</span> : null}
      </div>
      <ErrorBox message={error} />
    </div>
  );
}
