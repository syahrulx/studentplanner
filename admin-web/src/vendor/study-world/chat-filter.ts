/**
 * Study World chat filter. Runs on every message before anyone sees it.
 *
 * - Clearly bad words (built-in list + words admins blocked) become ****.
 * - Contact details (phone numbers, emails, links, social handles such as
 *   "ig: name") become [hidden], so nobody can pull someone off the platform.
 * - Doubtful words (disguised spellings close to a bad word) are hidden too
 *   and returned in `review`, so the admin website can mark them safe or bad.
 *   Only the word itself is ever sent for review: never the message, the
 *   nickname or the account.
 *
 * This runs in the browser, which a determined person can bypass. When chat
 * goes multiplayer the same filter must also run on the server.
 */

export type ChatFilterResult = {
  text: string;
  /** True when any word was starred out. */
  censored: boolean;
  /** True when a phone number, email, link or handle was hidden. */
  contactHidden: boolean;
  /** Doubtful words (normalised) to send to the admin review queue. */
  review: string[];
};

// Kept short and unambiguous: words with innocent meanings stay off this list
// and reach admins through the review queue instead.
const BUILT_IN_BLOCKED = [
  // English
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "bullshit",
  "bitch",
  "bastard",
  "asshole",
  "dick",
  "dickhead",
  "cunt",
  "pussy",
  "slut",
  "whore",
  "wanker",
  "twat",
  "cock",
  "cocksucker",
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "faggot",
  "fag",
  "retard",
  "porn",
  "porno",
  "nude",
  "nudes",
  "boobs",
  "tits",
  "dildo",
  "blowjob",
  "handjob",
  "horny",
  "rape",
  "rapist",
  "kys",
  "stfu",
  "wtf",
  "milf",
  "hentai",
  "onlyfans",
  // Malay / Manglish
  "babi",
  "bodoh",
  "bodo",
  "bangang",
  "bengap",
  "sial",
  "celaka",
  "bangsat",
  "keparat",
  "pukimak",
  "puki",
  "pantat",
  "lancau",
  "butoh",
  "kote",
  "burit",
  "pepek",
  "kontol",
  "memek",
  "ngentot",
  "jembut",
  "tetek",
  "lancap",
  "sundal",
  "jalang",
  "lahanat",
  "haramjadah",
  "anakharam",
  "mampus",
  "keling",
  "lanjiao",
  "kanina",
  "cibai",
  "pundek",
  "pukek",
];
// Matched inside longer words too ("motherfucking", "pukimakkau"). Only roots
// that never appear inside normal words.
const BUILT_IN_ROOTS = ["fuck", "cunt", "pukimak", "lancau", "kontol", "ngentot", "cibai"];

// Social apps people use to swap contacts. The word right after one is hidden.
const SOCIAL = new Set([
  "ig",
  "insta",
  "instagram",
  "tiktok",
  "twitter",
  "snap",
  "snapchat",
  "discord",
  "telegram",
  "tele",
  "tg",
  "whatsapp",
  "wasap",
  "wassap",
  "wechat",
  "fb",
  "facebook",
  "threads",
  "kik",
  "lineid",
]);
// Ordinary words that the sound-alike check would otherwise send for review.
const BUILT_IN_SAFE = [
  "dik",
  "adik",
  "kok",
  "kt",
  "batch",
  "pitch",
  "witch",
  "duck",
  "dock",
  "kick",
  "sick",
  "fik",
  "fak",
  "fakta",
  "fac",
  "fact",
  "shot",
  "shut",
  "sheet",
  "bach",
  "sit",
  "set",
  "niger",
  "nigeria",
  "night",
];
const MAIL_WORDS = new Set(["gmail", "yahoo", "hotmail", "outlook", "icloud", "ymail", "proton"]);
const NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "kosong",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "lapan",
  "sembilan",
]);

/** The lists built into the code, for the admin website to show. */
export const BUILT_IN_WORDS = { blocked: BUILT_IN_BLOCKED, safe: BUILT_IN_SAFE } as const;

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
  "+": "t",
  "€": "e",
};

/** Lower case, undo leetspeak, keep letters only. */
export function normalizeRaw(word: string): string {
  let out = "";
  for (const ch of word.toLowerCase()) {
    const mapped = LEET[ch] ?? ch;
    if (/\p{L}/u.test(mapped)) out += mapped;
  }
  return out;
}
const squeeze = (s: string) => s.replace(/(.)\1+/g, "$1");
/** normalizeRaw, then squeeze repeats ("fuuuck" → "fuck"). */
export const normalizeWord = (word: string) => squeeze(normalizeRaw(word));

// Exact spellings are checked first; squeezed spellings ("fuuuck") are the
// backup. That keeps "nigger" blocked while "Niger" (squeezed the same) is safe.
type Lists = { exact: Set<string>; squeezed: Set<string>; safe: Set<string>; roots: string[] };
function buildLists(blockedWords: string[], safeWords: string[]): Lists {
  const safeSet = new Set<string>();
  safeWords.forEach((w) => {
    safeSet.add(w);
    safeSet.add(squeeze(w));
  });
  const exact = new Set(blockedWords.filter((w) => !safeSet.has(w)));
  return {
    exact,
    squeezed: new Set([...exact].map(squeeze).filter((w) => !safeSet.has(w))),
    safe: safeSet,
    roots: BUILT_IN_ROOTS.filter((r) => !safeSet.has(r)),
  };
}
let lists = buildLists(BUILT_IN_BLOCKED, BUILT_IN_SAFE);

/** Words from the admin website: "blocked" adds to the list, "safe" overrides it. */
export function setAdminWords(words: { word: string; status: string }[]) {
  const extraBlocked: string[] = [];
  const extraSafe: string[] = [];
  words.forEach(({ word, status }) => {
    const w = normalizeRaw(word);
    if (!w) return;
    if (status === "blocked") extraBlocked.push(w);
    if (status === "safe") extraSafe.push(w);
  });
  lists = buildLists([...BUILT_IN_BLOCKED, ...extraBlocked], [...BUILT_IN_SAFE, ...extraSafe]);
}

function isBad(raw: string): boolean {
  if (lists.safe.has(raw)) return false;
  if (lists.exact.has(raw)) return true;
  const sq = squeeze(raw);
  if (lists.safe.has(sq)) return false;
  return lists.squeezed.has(sq) || lists.roots.some((r) => raw.includes(r) || sq.includes(r));
}

// Sound-alike form: "phuck", "fuk" and "fuck" all become "fuk".
const sound = (w: string) =>
  squeeze(w.replace(/ph/g, "f").replace(/ck/g, "k").replace(/[cq]/g, "k").replace(/z/g, "s"));
const skeleton = (w: string) => w.replace(/[aeiou]/g, "");
const vowels = (w: string) => w.length - skeleton(w).length;

/**
 * Doubtful: sounds like a bad word ("fuk", "phuck"), or is a bad word with
 * vowels dropped ("fck", "btch"). These go to a human instead of being guessed.
 */
function nearBad(norm: string): boolean {
  if (norm.length < 3 || lists.safe.has(norm)) return false;
  const s = sound(norm);
  const sk = skeleton(norm);
  for (const bad of lists.squeezed) {
    if (bad.length < 4) continue;
    if (s === sound(bad)) return true;
    if (sk.length >= 3 && sk === skeleton(bad) && vowels(norm) < vowels(bad)) return true;
  }
  return false;
}
/** A symbol hidden between letters ("b!tch", "f**k", "sh#t"): looks disguised. */
const looksDisguised = (core: string) => /\p{L}[*#$@!|]+\p{L}/u.test(core);

const stars = (s: string) => "*".repeat(s.length === 1 ? 1 : Math.max(3, s.length));
const HIDDEN = "[hidden]";
const REVIEW_MASK = "•••";

type Range = [number, number];
function markRanges(text: string, re: RegExp, ranges: Range[]) {
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    ranges.push([m.index, m.index + m[0].length]);
  }
}

/** Finds contact details. Returns character ranges to hide. */
function contactRanges(text: string): Range[] {
  const ranges: Range[] = [];
  // Treat the letter o as zero when it sits next to digits ("o12 345 6789").
  const digits = text.replace(/[oO](?=[\s\-.()]*\d)|(?<=\d[\s\-.()]*)[oO]/g, "0");
  // Phone, IC and account numbers: 9+ digits, allowing spaces, dashes, dots,
  // brackets and +. Shorter runs stay ("8.00-10.00", "CSP650").
  markRanges(digits, /\+?\d(?:[\s\-.()]*\d){8,}/g, ranges);
  // Emails, including "name at gmail dot com".
  markRanges(
    text,
    /[\w.+-]+\s*(?:@|\(at\)|\[at\]|\bat\b)\s*[\w-]+\s*(?:\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-z]{2,}/gi,
    ranges,
  );
  // Links and bare domains ("rencana.my", "site dot com").
  markRanges(text, /\b(?:https?:\/\/|www\.)\S+/gi, ranges);
  markRanges(
    text,
    /\b[\w-]+(?:\.|\s+dot\s+)(?:com|net|org|my|io|me|co|gg|ly|xyz|link|app|site|info|biz)\b(?:\/\S*)?/gi,
    ranges,
  );
  // @handles
  markRanges(text, /(?<![\w.])@[\w.]{2,}/g, ranges);
  return ranges;
}

export function filterChat(input: string): ChatFilterResult {
  const text = input.replace(/\s+/g, " ").trim();
  const hide = new Array<boolean>(text.length).fill(false);
  let contactHidden = false;
  contactRanges(text).forEach(([a, b]) => {
    contactHidden = true;
    for (let i = a; i < b; i++) hide[i] = true;
  });

  // Split into words, keeping where each one sits.
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({
    raw: m[0],
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    core: m[0].replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}]+$/gu, ""),
  }));
  const action = new Array<"keep" | "censor" | "contact" | "review">(tokens.length).fill("keep");
  const review = new Set<string>();

  tokens.forEach((tok, i) => {
    if (hide[tok.start]) {
      action[i] = "contact";
      return;
    }
    const raw = normalizeRaw(tok.core);
    const norm = squeeze(raw);
    const lower = tok.core.toLowerCase();
    if (!norm) return;
    // "ig: name", "my tele is name" → hide the handle after the app name.
    if (SOCIAL.has(lower.replace(/[^a-z]/g, ""))) {
      for (let j = i + 1; j < Math.min(tokens.length, i + 4); j++) {
        const next = tokens[j].core.toLowerCase();
        if (["is", "me", "my", "at", "add", "follow", "dm", "kat", "ialah", "nama"].includes(next))
          continue;
        if (/^[@\w.]{3,}$/.test(tokens[j].core)) {
          action[j] = "contact";
          contactHidden = true;
        }
        break;
      }
      return;
    }
    if (MAIL_WORDS.has(norm)) {
      action[i] = "contact";
      contactHidden = true;
      return;
    }
    // Handle-like words: "muhd.izwn01" (letters, a dot, more letters, digits).
    if (/^[a-z]{3,}[a-z0-9]*\.[a-z][a-z0-9_.]*\d[a-z0-9_.]*$/i.test(tok.core)) {
      action[i] = "contact";
      contactHidden = true;
      return;
    }
    if (isBad(raw)) action[i] = "censor";
    else if (looksDisguised(tok.core) || nearBad(norm)) {
      action[i] = "review";
      if (norm.length <= 40) review.add(norm);
    }
  });

  // "f u c k" or "b.a.b.i": runs of single characters spelling a bad word.
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (j < tokens.length && normalizeWord(tokens[j].core).length === 1) j++;
    if (j - i >= 3) {
      const joined = normalizeRaw(
        tokens
          .slice(i, j)
          .map((t) => t.core)
          .join(""),
      );
      if (isBad(joined)) for (let k = i; k < j; k++) action[k] = "censor";
    }
    i = Math.max(j, i + 1);
  }
  tokens.forEach((tok, i) => {
    if (action[i] !== "keep") return;
    const dotted = tok.core.split(/[.\-_*]/).filter(Boolean);
    if (dotted.length >= 3 && dotted.every((p) => p.length === 1) && isBad(normalizeRaw(tok.core)))
      action[i] = "censor";
  });

  // Spelled-out phone numbers: 7+ number words or digits in a row.
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (
      j < tokens.length &&
      (NUMBER_WORDS.has(tokens[j].core.toLowerCase()) || /^\d+$/.test(tokens[j].core))
    )
      j++;
    if (j - i >= 7) {
      for (let k = i; k < j; k++) action[k] = "contact";
      contactHidden = true;
    }
    i = Math.max(j, i + 1);
  }

  let out = "";
  let cursor = 0;
  let censored = false;
  tokens.forEach((tok, i) => {
    out += text.slice(cursor, tok.start);
    cursor = tok.end;
    const a = action[i];
    if (a === "keep") {
      // Partly covered by a contact match (e.g. a link inside punctuation).
      let piece = "";
      let inHidden = false;
      for (let c = tok.start; c < tok.end; c++) {
        if (hide[c]) {
          if (!inHidden) piece += HIDDEN;
          inHidden = true;
        } else {
          piece += text[c];
          inHidden = false;
        }
      }
      out += piece;
      return;
    }
    const lead = tok.raw.slice(0, tok.raw.indexOf(tok.core));
    const trail = tok.raw.slice(tok.raw.indexOf(tok.core) + tok.core.length);
    if (a === "censor") {
      censored = true;
      out += lead + stars(tok.core) + trail;
    } else if (a === "review") {
      censored = true;
      out += lead + REVIEW_MASK + trail;
    } else out += (out.endsWith(HIDDEN + " ") ? "" : HIDDEN) + trail;
  });
  out += text.slice(cursor);
  // Merge "[hidden] [hidden]" runs into one.
  out = out.replace(/(\[hidden\]\s*)+/g, (m) => `${HIDDEN}${m.endsWith(" ") ? " " : ""}`).trim();

  return { text: out, censored, contactHidden, review: [...review] };
}

/** For nicknames: no bad words, no contact details. */
export function nicknameProblem(value: string): string {
  const result = filterChat(value);
  if (result.contactHidden) return "No emails, phone numbers, links or handles";
  if (result.censored) return "Please choose a different nickname";
  return "";
}
