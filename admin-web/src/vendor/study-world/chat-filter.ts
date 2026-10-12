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

// ─── Usernames: words that aren't ordinary words ────────────────────────────
// A compact list of common English and Malay words of 5+ letters (shorter words
// are always allowed). Chat words of 5+ letters that aren't on this list, after
// trimming common endings, are treated as possible usernames and hidden. This
// WILL hide some real words, names, slang and typos: admins can unhide any word
// with "Mark safe" on the admin website.
const COMMON_WORDS = new Set(
  "about above abroad absent accept access account across action active actually added adding advance advice afraid after afternoon again against agree ahead alarm alive allow almost alone along already alright although always amazing among amount angry animal annoying another answer answers anxious anybody anymore anyone anything anyway anywhere apart apply appreciate approach april arent arrive article artist asked asking assignment assignments attempt attend attention august aunty avatar avoid awake award aware awesome awful awkward backpack balance banana based basic basically beach beautiful became because become bedroom before began begin beginning behind being believe below beside besides better between beyond birthday biscuit bless blessed blood board boring borrow bother bottle bottom bought brain bread break breakfast bridge brief bright bring broke broken brother brought brown budget build building built burger business button buying cable calculate calculator called calling camera campus cancel candy cannot canteen capital caption career careful carry casual catch caught cause certain chair challenge chance change changed chapter chapters charge charger chart chase cheap check cheese chicken child children chill choice choose chosen chocolate church circle class classes classmate classmates classroom clean clear clever click climb clock close closed clothes cloud coach coffee coins collect college colour color colours colors combo comfortable coming comment common company compare complete computer concept confirm confused congrats congratulations connect consider contact continue control cookie cooking corner correct costume could couldnt count counter country couple course courses cousin cover crazy cream create credit cross crowd crying culture curious current customise customize cycle daily damage dance danger darling deadline deadlines dealing death debate decide decided defense define delete delicious depend describe design detail details develop device diary didnt different difficult dinner direct direction dirty discuss discussion dislike distance doctor doesnt doing dollar double doubt download dozen draft drama drawing dream dress drink drive driver during early earth easier easily eaten education effect effort eight either electric eleven email emote emotes empty ended energy engine english enjoy enough enter entire episode equal equation equations error essay estimate evening event events every everybody everyone everything everywhere exact exactly exams example excel excellent except excited exciting excuse exercise exist expect expensive experience explain extra failed fairly faith falling false family famous fancy fantastic faster father favourite favorite feature february feeling fellow fever field fifteen fifth fifty fight figure filled final finally finals finance finding finish finished first fitness fixed flash flashcard flashcards floor flower focus follow followed football force forest forget forgot forgotten formula formulas forty forward found fourth freedom fresh friday fridge friend friends friendly front frozen fruit funny future gallery games garden gather general generally gentle getting giant given gives giving glass global going gonna goods google gotta grade grades graduate grammar grand great green greet group groups growing guess guest guide guitar guys habit hallo handle happen happened happens happy harder hardly havent having headache health healthy heard heart heaven heavy hello helped helpful helping hidden higher highly history hobby holiday homework honest honestly hoping horse hospital hostel hotel hours house however huge human humor hundred hungry hurry husband ideas identity image imagine immediately important improve include including income indeed information inside instead interest interesting internet interview introduce invite island issue itself january jacket jealous joined joining journey judge juice jumping junior justice keeping kidding kinda kitchen knife knock known knowledge label ladies language large later laugh laundry layer leader learn learned learning least leave leaving lecture lectures lecturer lecturers legal lemon length lesson lessons letter level library light likely limit linked listen little lived lives living local location lonely longer looked looking loose losing lovely lower lucky lunch machine magic major maker making manage management manager march marks market marriage married master match matter maths maybe meaning measure media medical medicine meeting member members memory mental mention merry message messages method middle midnight midterm might minor minute minutes mirror missed missing mistake mixed mobile model modern module modules moment monday money month months moral morning mostly mother motivation mountain mouse mouth movie movies moving music myself narrow nation natural nature naughty nearby nearly necessary needed negative neighbour nervous never newer newly night nobody noise normal north nothing notes notice novel number numbers nurse obviously ocean october offer office often okay older online opinion option order other others otherwise ought outside overall owner paint paper papers parent parents party passed password pasta patient pause payment peace people pepper perfect perhaps period person personal phone photo piano picnic picture piece place plain plane planet planner plans plant plants plate please pleasure plenty pocket point police polite pomodoro popular position positive possible potato power practice practical practise prayer prefer prepare present presentation presentations pretty price print prior private prize probably problem problems process produce product professor profile program programming project projects promise proper protect proud prove public pupil purple purpose puzzle quarter queen question questions quick quickly quiet quite quizzes radio rainy raise rather reach react reading ready really reason recent recently record relax remember remind remove repeat reply report reports research reset respect result results review revise revision rhyme right river robot rocket rolling rough round route royal rubbish rules sadly safety salad salary sandwich saturday saved saying scared schedule school science score scores screen search season second secret section seeing seems selfie semester semesters senior sense sentence separate september serious seriously server service seven several shake shall shape share sharing sharp sheet shelf shirt shoes shoot shopping short should shouldnt shoulder shout showing shower sibling sight signal silent silly simple since singer single sister sitting skill skills sleep sleepy slide slides slightly slowly small smart smell smile snack snacks softly solve somebody someday somehow someone something sometimes somewhere sorry sound sounds south space speak speaker special speech speed spell spend spent spirit sport sports spring square staff stage stairs stand start started starting state station stats statistics still stomach stone story straight strange street stress stressed strong stuck student students studied studies study studying stuff style subject subjects submit submission success sudden sugar suggest summary summer sunday super support suppose surprise sweet swimming syllabus system table taken taking talent talking tasty teach teacher teachers teaching tears teeth telling temple tennis terrible thank thanks thankyou thats their theirs theme there theres these theory thesis theyre thing things think thinking third thirsty thirty those though thought thousand three throat through throw thursday ticket timetable tired title today together toilet tomorrow tonight topic topics total touch tough towards tower track trade traffic train training travel treat trick tried tries trouble truck truly trust truth trying tuesday turned tutor tutorial tutorials twelve twenty twice under understand understood unless until upload upset useful usual usually valid value video videos village visit voice volume waiting walking wallet wanna wanted wants warning wasnt watch watching water wearing weather website wedding wednesday weekend weeks weird welcome werent whatever whats wheel where whether which while white whole whose window winner winter wishes within without woman women wonder wonderful wondering words worked worker working world worried worry worse worst worth would wouldnt write writing written wrong yellow yesterday young younger youre yours yourself youth algebra anatomy architecture biology biochemistry chemistry physics calculus coding database economics engineering geography geometry literature marketing mathematics microbiology nursing pharmacy psychology python javascript accounting sociology philosophy diploma degree bachelor masters faculty cafeteria journal rencana world arena timer focusing harvest fountain greenhouse locker lockers arcade matcha latte sushi pizza abang adakah agama ajaran akhir akhirnya aktiviti alamak alhamdulillah amboi apakah asrama assalamualaikum waalaikumsalam insyaallah inshaallah mashaallah subhanallah astaghfirullah bismillah badan bagus bahagia bahasa baiklah balik bangun banyak barang basikal bawah belajar belakang belum benar benda berapa berani berat bersama besar betul biasa bilik bincang bising boleh bosan buang bukan bukannya bulan cakap cantik cepat cerita cikgu comel cuaca cubaan cukup dalam dapat dapur datang dekat depan dewan dengan dengar diorang dorang korang kitorang doakan duduk dunia emak faham fikir gambar gembira geram gempak gunakan habis hadiah hairan hantar harga harap harapnya harini semalam hendak hidup hilang hujan hujung ibubapa ikhlas istimewa jadual jalan jangan jawab jawapan jemput jumpa kakak kalau kampung kawan kebanyakan kedai kejap kelas kemas kenapa kenal kerana kereta kerja kertas kesian ketawa khabar kongsi kosong kuliah kurang lagipun lambat lapar latihan lawak lebih lelaki lepas lepak macam makan makanan malam malas mamak mampu manis marah masalah masih masuk matematik memang mesej minggu minta minum mudah mulakan mungkin murah nanti negeri nombor okeylah orang pandai panggil panjang pasal pastu payah pejabat pelajar pelajaran pelik pening penat pensyarah percuma perempuan pergi perlu pernah pesan petang pilih pinjam pukul pulang punya rajin rakan rasanya rehat relaks rindu rumah sahabat sahaja sakit sampai sangat sayang sebab sebelum sebenarnya sedap sedang sedih sekali sekarang sekejap sekolah selalu selamat semangat semua semoga sempoi senang sendiri sentiasa seronok setiap siapa sikit simpan soalan steady sudah sukar sungguh susah tahun takut tanya tengah tengahari tengok terbaik terima kasih terus tidak tiada takde takpe takpa tidur tinggal tolong tunggu ujian untuk usaha waktu walaupun warna camne camtu camni macamni macamtu bestnya agaknya kelakar hensem handsome budak makcik pakcik ustaz ustazah doktor encik jumaat sabtu isnin selasa khamis berjaya ngantuk mengantuk kenyang nasib member buddy bestie dahlah jomlah takpelah slaps outfit outfits tomato tomatoes potatoes onion onions garlic noodle noodles burger fries chicken mango apple apples orange oranges grape grapes cherry berry strawberry watermelon coconut shirt shirts jeans dress jacket hoodie sweater skirt sneakers slippers glasses suruh disuruh selangor johor kedah kelantan melaka pahang perak perlis penang pinang sabah sarawak terengganu kuala lumpur putrajaya labuan shah alam petaling ipoh seremban kuantan kuching kinabalu malaysia singapore indonesia brunei thailand japan korea china india arabia mecca makkah madinah europe london america africa australia konek connect hutan pokok bunga taman sungai pantai gunung kucing anjing burung ikan ayam daging sayur buah nasi lemak goreng teh tarik kopi susu roti mee kuih hujan panas sejuk angin cahaya bintang langit bulan matahari rumah kereta motor basikal bas keretapi lapangan terbang hospital klinik masjid surau sekolah kedai pasar bandar kampung negeri negara bacteria virus cells protein molecule energy reaction element elements compound carbon oxygen hydrogen nitrogen organism organisms genetics evolution ecology climate pollution volume velocity acceleration momentum gravity electron electrons neutron proton atom atoms magnet circuit voltage current resistance function functions variable variables integer integers fraction fractions percent percentage graph graphs matrix vector vectors derivative integral limits probability average median standard deviation sample population survey analysis method methods introduction conclusion abstract citation references reference perpustakaan fakulti universiti kolej kafeteria tugasan pembentangan peperiksaan markah kumpulan projek kuliah kelas pagi petang malam sesi semakan latihan modul subjek kursus bahan rujukan contoh jawapan soalan formula nota buku komputer telefon internet wifi bateri"
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => [w, squeeze(w)]),
);
const EN_ENDINGS = [
  "s",
  "es",
  "ed",
  "d",
  "ing",
  "ly",
  "er",
  "ers",
  "est",
  "ness",
  "ment",
  "ments",
  "ful",
];
const MY_PREFIXES = [
  "memper",
  "menge",
  "meng",
  "meny",
  "mem",
  "men",
  "me",
  "ber",
  "be",
  "ter",
  "di",
  "ke",
  "peng",
  "pem",
  "pen",
  "per",
  "pe",
  "se",
];
const MY_SUFFIXES = [
  "kanlah",
  "kannya",
  "kan",
  "an",
  "i",
  "nya",
  "lah",
  "kah",
  "pun",
  "tah",
  "ku",
  "mu",
];
const LAUGH = /^(?:ha|he|hi|hu|wk|ks|lo|lm)+[ho]?$/;
const isCommon = (w: string) =>
  COMMON_WORDS.has(w) ||
  COMMON_WORDS.has(squeeze(w)) ||
  lists.safe.has(w) ||
  lists.safe.has(squeeze(w));

function knownPart(w: string): boolean {
  if (w.length <= 4 || squeeze(w).length <= 4 || isCommon(w) || LAUGH.test(squeeze(w))) return true;
  for (const end of EN_ENDINGS)
    if (w.endsWith(end)) {
      const base = w.slice(0, -end.length);
      if (isCommon(base) || isCommon(`${base}e`)) return true;
      // Short base words ("slaps", "passing") are fine like other short words.
      if (
        ["s", "es", "ed", "ing", "er", "ly"].includes(end) &&
        base.length >= 2 &&
        base.length <= 4
      )
        return true;
      if (/(.)\1$/.test(base) && isCommon(base.slice(0, -1))) return true;
    }
  if ((w.endsWith("ies") || w.endsWith("ied")) && isCommon(`${w.slice(0, -3)}y`)) return true;
  // Malay: strip a suffix and/or a prefix ("belajarlah", "diorangnya", "membuat").
  for (const suf of ["", ...MY_SUFFIXES]) {
    if (suf && !w.endsWith(suf)) continue;
    const noSuf = suf ? w.slice(0, -suf.length) : w;
    if (suf && noSuf.length >= 4 && isCommon(noSuf)) return true;
    for (const pre of MY_PREFIXES)
      if (noSuf.startsWith(pre) && isCommon(noSuf.slice(pre.length))) return true;
  }
  return false;
}
/** Is this an ordinary word? Parts split by - or ' are checked one by one. */
function isKnownWord(core: string): boolean {
  const parts = core
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
  return parts.length > 0 && parts.every(knownPart);
}

// Letters people type instead of digits in phone numbers.
const DIGIT_LOOKALIKE: Record<string, string> = {
  o: "0",
  O: "0",
  l: "1",
  I: "1",
  i: "1",
  "|": "1",
  z: "2",
  Z: "2",
  e: "3",
  E: "3",
  a: "4",
  A: "4",
  s: "5",
  S: "5",
  b: "6",
  G: "6",
  t: "7",
  T: "7",
  B: "8",
  g: "9",
  q: "9",
};
/** The digits a number-like word stands for ("ol36426438" → "0136426438"), or null. */
export function numberDigits(core: string): string | null {
  if (!/\d/.test(core) && !/^[oOlI|]{1,3}$/.test(core)) return null;
  // Times, decimals and ranges stay: 8.00, 10:30, 3.5, 8.00-10.00
  if (/^\d{1,2}[.:]\d{2}(?:-\d{1,2}[.:]\d{2})?(?:am|pm)?$/i.test(core) || /^\d+\.\d+$/.test(core))
    return null;
  let out = "";
  for (const ch of core) {
    if (/\d/.test(ch)) out += ch;
    else if (DIGIT_LOOKALIKE[ch]) out += DIGIT_LOOKALIKE[ch];
    else if (/[\s\-.()+/]/.test(ch)) continue;
    else return null;
  }
  return out;
}
/** 7+ digits, or a Malaysian mobile start (01x… / 601x…) with 6+ digits. */
export const looksLikePhone = (digits: string) =>
  digits.length >= 7 || (/^(?:01|601)\d/.test(digits) && digits.length >= 6);

// Course codes (CSC508, ITS232, MAT183) and everyday letter+number words stay.
const OK_ALNUM = [
  /^[a-z]{2,4}\d{3,4}[a-z]?$/i,
  /^\d+(?:st|nd|rd|th|am|pm|h|hr|hrs|min|mins|m|k|s|x|mb|gb|kg|km|cm|mm|sen|pts?)$/i,
  /^(?:rm|q|ch|chap|wk|week|sem|lab|tut|lec|part|no|lvl|level|grade|form|year|yr|day|room|blok|block|page|pg|p|t|l|v|ver|ps|mp|h|co|covid)\d{1,3}$/i,
  /^\d[a-z]$/i,
  /^(?:ch|chap|q|sec|s|p|pg|no|part)\d{1,2}(?:\.\d{1,2}){0,2}$/i,
];
// Words after which the next word is likely a username: "add me X", "dm me X".
const HANDLE_TRIGGERS = new Set([
  "add",
  "follow",
  "followme",
  "dm",
  "pm",
  "find",
  "search",
  "cari",
  "carik",
  "id",
  "acc",
  "account",
  "akaun",
  "user",
  "username",
  "handle",
  "ign",
  "uname",
]);
const HANDLE_FILLERS = new Set([
  "me",
  "aku",
  "saya",
  "sy",
  "i",
  "my",
  "at",
  "on",
  "is",
  "kat",
  "dekat",
  "ialah",
  "nama",
  "the",
  "for",
  "ke",
  "as",
  "to",
  "using",
  "guna",
  "by",
  "id",
  "acc",
  "account",
  "akaun",
  "user",
  "username",
  "ig",
  "insta",
  "tiktok",
  "name",
  "kt",
  "dkt",
  "it",
  "its",
]);
const HANDLE_STOP = new Set([
  "later",
  "now",
  "back",
  "tomorrow",
  "esok",
  "nanti",
  "when",
  "if",
  "after",
  "please",
  "pls",
  "plz",
  "thanks",
  "ok",
  "okay",
  "k",
  "ya",
  "yes",
  "no",
  "tak",
  "lah",
  "je",
  "jer",
  "too",
  "also",
  "more",
  "up",
  "out",
  "in",
  "and",
  "or",
  "pun",
  "dulu",
]);

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

export type FilterOptions = {
  /** Hide anything that looks like a username (on for chat, off for nicknames). */
  usernames?: boolean;
  /**
   * Digits from your own number-only messages in the last couple of minutes,
   * so a phone number typed in pieces ("013", "294", "2747") is still caught.
   * Kept in the browser only.
   */
  priorDigits?: string;
  /** Nicknames of people in the room: always shown, even if they look like usernames. */
  allowNames?: string[];
};

/** If a message is only numbers ("013", "294 2747"), the digits it stands for. */
export function messageDigits(text: string): string | null {
  const cores = text
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (!cores.length || !cores.some((c) => /\d/.test(c))) return null;
  let out = "";
  for (const c of cores) {
    const d = numberDigits(c);
    if (d === null) return null;
    out += d;
  }
  return out;
}

export function filterChat(input: string, options: FilterOptions = {}): ChatFilterResult {
  const usernames = options.usernames ?? true;
  const allowed = new Set((options.allowNames ?? []).map((n) => n.toLowerCase()));
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
    core: m[0].replace(/^[^\p{L}\p{N}@_]+|[^\p{L}\p{N}_]+$/gu, ""),
  }));
  const action = new Array<"keep" | "censor" | "contact" | "review">(tokens.length).fill("keep");
  const review = new Set<string>();

  // Room nicknames, and markers from an earlier pass ("[hidden]", "•••", "****"
  // in a message someone else already filtered), are left exactly as they are.
  const fixed = tokens.map(
    (t) => allowed.has(t.core.toLowerCase()) || /^(?:\[hidden\]|•••|\*{3,})\W*$/u.test(t.raw),
  );
  tokens.forEach((tok, i) => {
    if (fixed[i]) return;
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
    if (isBad(raw)) {
      action[i] = "censor";
      return;
    }
    if (usernames && /\p{L}/u.test(tok.core)) {
      // Username shapes: an underscore, or a dot between letters ("muhd.izwan",
      // "muhdizwn__"); letters mixed with digits ("izwan99"). Course codes and
      // "e.g." stay.
      const dotted =
        /\p{L}\.\p{L}/u.test(tok.core) && !/^(?:e\.g|i\.e|a\.m|p\.m|u\.s|u\.k)\.?$/i.test(tok.core);
      const alnum = /\d/.test(tok.core) && !OK_ALNUM.some((re) => re.test(tok.core));
      if (tok.core.includes("_") || dotted || alnum) {
        action[i] = "contact";
        contactHidden = true;
        return;
      }
    }
    if (isBad(raw)) action[i] = "censor";
    else if (looksDisguised(tok.core) || nearBad(norm)) {
      action[i] = "review";
      if (norm.length <= 40) review.add(norm);
    } else if (
      usernames &&
      tok.core.length >= 5 &&
      /^[\p{L}'’-]+$/u.test(tok.core) &&
      !isKnownWord(tok.core)
    ) {
      // Not an ordinary word: possibly a username. Hidden, and never sent for
      // review (a username is personal data).
      action[i] = "contact";
      contactHidden = true;
    }
  });

  // "add me X", "dm me X", "id aku X": the word after is likely a username.
  if (usernames)
    tokens.forEach((tok, i) => {
      if (!HANDLE_TRIGGERS.has(tok.core.toLowerCase())) return;
      let j = i + 1;
      let skipped = 0;
      const filler = (w: string) => HANDLE_FILLERS.has(w) || SOCIAL.has(w.replace(/[^a-z]/g, ""));
      while (j < tokens.length && filler(tokens[j].core.toLowerCase())) {
        j++;
        skipped++;
      }
      if (j >= tokens.length || action[j] !== "keep" || fixed[j]) return;
      const next = tokens[j].core;
      if (!next || HANDLE_STOP.has(next.toLowerCase())) return;
      if (skipped > 0 || !isKnownWord(next)) {
        action[j] = "contact";
        contactHidden = true;
      }
    });

  // Phone numbers in disguise: "ol36426438", "0I329427", "o13 294 2747", and
  // pieces sent in earlier messages (priorDigits).
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    let digits = "";
    let real = false;
    while (j < tokens.length && !fixed[j]) {
      const d = numberDigits(tokens[j].core);
      if (d === null) break;
      if (/\d/.test(tokens[j].core)) real = true;
      digits += d;
      j++;
    }
    if (
      j > i &&
      real &&
      (looksLikePhone(digits) || looksLikePhone((options.priorDigits ?? "") + digits))
    ) {
      for (let k = i; k < j; k++) action[k] = "contact";
      contactHidden = true;
    }
    i = Math.max(j, i + 1);
  }

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
  const result = filterChat(value, { usernames: false });
  if (result.contactHidden) return "No emails, phone numbers, links or handles";
  if (result.censored) return "Please choose a different nickname";
  return "";
}
