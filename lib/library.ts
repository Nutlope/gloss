/**
 * The library: every text on your shelf, shelved by topic. A fixed set of
 * topics, each with a cloth colour (four shades, so its books look like a
 * set), a painted plate and a small clay icon. Books get their spine, height
 * and colour from their id, so the same book always looks the same.
 *
 * Shared by the client (the shelves) and the server (the classifier and the
 * agent server): no React, no store, no fetches.
 */

export type TopicKey =
  | "ai"
  | "programming"
  | "infra"
  | "data"
  | "security"
  | "tech"
  | "design"
  | "product"
  | "startups"
  | "business"
  | "work"
  | "economics"
  | "money"
  | "science"
  | "health"
  | "mind"
  | "climate"
  | "philosophy"
  | "history"
  | "politics"
  | "culture"
  | "writing"
  | "learning"
  | "living"
  | "unsorted";

export type Topic = {
  key: TopicKey;
  name: string;
  /** Cloth shades: [base, light, deep, pale]. */
  shades: [string, string, string, string];
  blurb: string;
  /** What belongs here, for the classifier. */
  hint: string;
  /** The two inks, for a painted cover in this topic. */
  inks: string;
};

export const TOPICS: Topic[] = [
  { key: "ai", name: "سۈنئىي ئەقىل", shades: ["#5b4a9e", "#7a68bf", "#3b2f6e", "#a597d6"], inks: "deep violet and soft lavender", hint: "machine learning, language models, AI research, AI products and agents", blurb: "ئۆگىنىدىغان ماشىنىلار: مودېللار، ۋاكالەتچىلەر، تەتقىقات ۋە بۇلارنىڭ مەنىسى." },
  { key: "programming", name: "پروگراممىلاش", shades: ["#2f4f8f", "#4a6fb3", "#1d3263", "#8aa6d8"], inks: "navy blue and cornflower blue", hint: "software engineering, languages, code, developer tools, open source, engineering practice", blurb: "يۇمشاق دېتال قانداق ياسىلىدۇ ۋە ئۇنى ياسايدىغان كىشىلەر." },
  { key: "infra", name: "ئۇل ئەسلىھە", shades: ["#6b6a2a", "#8b8a43", "#4a491a", "#bdbb7f"], inks: "olive and pale khaki", hint: "systems, cloud, GPUs, inference, databases, distributed systems, performance, devops", blurb: "ئاستىدىكى ماشىنا: سىستېمىلار، ئۆزەكلەر، بۇلۇتلار ۋە ئۇلارنىڭ ھېسابلىرى." },
  { key: "data", name: "سانلىق مەلۇمات", shades: ["#2a6f8a", "#4a90a8", "#1a4c60", "#8fc0d0"], inks: "petrol blue and pale aqua", hint: "data science, analytics, statistics, visualisation, data engineering", blurb: "نەرسىلەرنى ئەستايىدىل ساناش ۋە سانلارنىڭ نېمە دەيدىغانلىقىنى كۆرسىتىش." },
  { key: "security", name: "بىخەتەرلىك", shades: ["#3d4a52", "#5b6a73", "#262f35", "#9aa8b0"], inks: "slate grey and steel blue", hint: "security, privacy, cryptography, attacks, trust", blurb: "قۇلۇپلار، ئاچقۇچلار ۋە ئىككىسىنى سىنايدىغان كىشىلەر." },
  { key: "tech", name: "تېخنىكا ۋە ئىنتېرنېت", shades: ["#3e6c9e", "#5e8cbe", "#284b70", "#a3c2e2"], inks: "cobalt and sky blue", hint: "the tech industry, platforms, internet culture, gadgets, big tech news", blurb: "سانائەت، سۇپىلار ۋە بىز ياشاۋاتقان ئىنتېرنېت." },
  { key: "design", name: "لايىھە", shades: ["#c0603a", "#d9805a", "#8f4224", "#efb698"], inks: "coral and apricot", hint: "design, UX, typography, interfaces, craft, architecture", blurb: "نەرسىلەرنىڭ كۆرۈنۈشى، ھېسسىياتى ۋە ئىشلىشى." },
  { key: "product", name: "مەھسۇلات", shades: ["#8a5a9e", "#a87abb", "#62406f", "#cfb0dc"], inks: "mauve and lilac", hint: "product management, building products, user research, launches, growth", blurb: "نېمە ياساشنى قارار قىلىش ۋە ئۇنىڭ ئۈنۈمىنى بىلىش." },
  { key: "startups", name: "يېڭى كارخانىلار", shades: ["#a43848", "#c65767", "#782333", "#e39aa5"], inks: "crimson and dusty rose", hint: "startups, founders, fundraising, venture capital, go to market", blurb: "كىشىلەر خالايدىغان نەرسىلەرنى تۇنجى ئىشلەتكۈچىلەردىن باشلاپ ياساش." },
  { key: "business", name: "سودا", shades: ["#7a5230", "#9a7050", "#563820", "#c9a585"], inks: "walnut brown and tan", hint: "companies, strategy, management, markets, competition", blurb: "شىركەتلەر، ئىستراتېگىيە ۋە بازارلارنىڭ ھەرىكىتى." },
  { key: "work", name: "خىزمەت ۋە كەسىپ", shades: ["#7a4b32", "#9a6a4e", "#563220", "#c9a088"], inks: "chestnut brown and soft peach", hint: "careers, hiring, leadership, teams, productivity at work, remote work", blurb: "خىزمەت، گۇرۇپپا ۋە ئۇزۇن مۇددەت ياخشى ئىشلەش." },
  { key: "economics", name: "ئىقتىساد", shades: ["#40705a", "#5f9078", "#2a4e3e", "#a0c8b4"], inks: "jade green and mint", hint: "economics, policy, trade, labour markets, macro", blurb: "رىغبەتلەر، تاللاشلار ۋە پۈتۈن سىستېمىنىڭ ھەرىكىتى." },
  { key: "money", name: "پۇل", shades: ["#8a7a20", "#a89838", "#5f5410", "#d6ca82"], inks: "old gold and pale brass", hint: "personal finance, investing, markets, crypto", blurb: "تېجەش، مەبلەغ سېلىش ۋە پۇل ھەققىدىكى ھېكايىلىرىمىز." },
  { key: "science", name: "ئىلىم-پەن", shades: ["#3a6b45", "#5a8d5e", "#274a30", "#9cc29a"], inks: "forest green and sage", hint: "physics, biology, chemistry, maths, space, research and how science works", blurb: "دۇنيا قانداق ئىشلەيدۇ ۋە بىز ئۇنى قانداق بىلىمىز." },
  { key: "health", name: "سالامەتلىك", shades: ["#b5485e", "#cf6a7e", "#86303f", "#eda9b6"], inks: "raspberry red and blush pink", hint: "health, medicine, fitness, nutrition, sleep", blurb: "بەدەن، تىبابەت ۋە ساغلام تۇرۇش." },
  { key: "mind", name: "ئەقىل-روھىيەت", shades: ["#4c5fa8", "#6c7ec4", "#33427a", "#aab6e6"], inks: "periwinkle and indigo", hint: "psychology, neuroscience, behaviour, habits, decision making", blurb: "نېمىشقا شۇنداق ئويلايمىز، ھېس قىلىمىز ۋە قارار قىلىمىز." },
  { key: "climate", name: "كلىمات ۋە ئېنېرگىيە", shades: ["#4f7f3a", "#6f9f55", "#355a25", "#aed096"], inks: "leaf green and lime", hint: "climate change, energy, environment, sustainability", blurb: "ئېنېرگىيە، يەرشارى ۋە كېيىنكى قىلىدىغانلىرىمىز." },
  { key: "philosophy", name: "پەلسەپە", shades: ["#5e4b7a", "#7c6a99", "#3f3154", "#b9acd0"], inks: "plum grey and heather", hint: "philosophy, ethics, religion, meaning, big ideas", blurb: "كونا سوئاللار، ھېلىھەم ئوچۇق." },
  { key: "history", name: "تارىخ", shades: ["#8c5a2b", "#aa7745", "#633e1a", "#d9b48a"], inks: "sepia brown and parchment ochre", hint: "history, biography, how things came to be", blurb: "بىز بۇ يەرگە قانداق كەلدۇق." },
  { key: "politics", name: "سىياسەت ۋە جەمئىيەت", shades: ["#9a3a2e", "#b85a4c", "#6e261d", "#e0a196"], inks: "brick red and pale terracotta", hint: "politics, government, law, society, current affairs, cities", blurb: "ھوقۇق، سىياسەت ۋە بىرلىكتە قانداق ياشايمىز." },
  { key: "culture", name: "مەدەنىيەت", shades: ["#b0447e", "#c9669a", "#82305b", "#e8a9cb"], inks: "magenta and pink", hint: "art, film, music, books, games, media, criticism", blurb: "سەنئەت، كىنو، مۇزىكا، ئويۇنلار ۋە ياقتۇرىدىغان نەرسىلىرىمىز." },
  { key: "writing", name: "يېزىقچىلىق", shades: ["#b0502d", "#cc7147", "#86381c", "#e6a580"], inks: "terracotta and burnt orange", hint: "writing, language, storytelling, journalism, communication", blurb: "سۆزلەر، جۈملىلەر ۋە ئېنىق ئىپادىلەش ماھارىتى." },
  { key: "learning", name: "ئۆگىنىش", shades: ["#2c7a76", "#4c9b94", "#1c5654", "#8cc4bd"], inks: "deep teal and pale sea-green", hint: "education, learning, teaching, memory, tools for thought, note-taking", blurb: "قانداق ئۆگىنىمىز، ئەستە ساقلايمىز ۋە قوراللار بىلەن ئويلايمىز." },
  { key: "living", name: "تۇرمۇش", shades: ["#b0841f", "#cda03a", "#835f15", "#e5c97a"], inks: "mustard ochre and olive green", hint: "life, relationships, attention, time, happiness, personal essays, food, travel", blurb: "دىققەت، ۋاقىت ۋە ھاياتنىڭ قالغان قىسمى." },
  { key: "unsorted", name: "تۈرلەنمىگەن", shades: ["#5d5a55", "#7b776f", "#3f3d39", "#aaa59b"], inks: "warm grey and charcoal", hint: "", blurb: "تېخى جاۋىغا قويۇلمىغان. Gloss يېڭى تېكىستلەرنى كەلگەندە تۈرلەيدۇ." },
];

export const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.key, t])) as Record<TopicKey, Topic>;
export const isTopic = (v: unknown): v is TopicKey => typeof v === "string" && v in TOPIC;
export const topicOf = (v: unknown): TopicKey => (isTopic(v) ? v : "unsorted");

/** One text as the shelves see it: the shelf entry, with your reading laid over it. */
export type Book = {
  id: string;
  title: string;
  author: string;
  year?: number;
  url?: string;
  topic: TopicKey;
  minutes: number;
  dek?: string;
  tags: string[];
  favorite: boolean;
  /** 0 to 1. */
  pct: number;
  highlights: number;
  added: number;
  finished?: number;
  /** The page's own picture, shown duotone. */
  image?: string;
  /** A painted cover: a bundled one by path, or "painted" for one made for you. */
  cover?: string;
  /** Saved by an agent rather than by hand. */
  agent: boolean;
  /** A bundled sample: always there, cannot be removed. */
  sample: boolean;
};

/* ---------- looks ---------- */

/** FNV-1a, then a small PRNG: the same id always gives the same book. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SpineStyle = "bands" | "label" | "sans" | "foil";

export type Look = {
  color: string;
  /** Text and rules on the cloth. */
  fg: string;
  light: boolean;
  style: SpineStyle;
  w: number;
  h: number;
  hue: number;
};

const STYLES: SpineStyle[] = ["bands", "label", "sans", "foil"];

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hueOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.08) return 400 + luminance(hex) * 100; // greys after the rainbow
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360 + 20) % 360; // start the rainbow at red
}

const looks = new Map<string, Look>();

export function lookOf(b: Pick<Book, "id" | "topic" | "minutes">): Look {
  const key = `${b.id}:${b.topic}:${b.minutes}`;
  const hit = looks.get(key);
  if (hit) return hit;
  const r = rng(hash(b.id));
  const shades = TOPIC[b.topic].shades;
  // Mostly the base and deep cloths; the light and pale ones now and then, for rhythm.
  const pick = r();
  const color = shades[pick < 0.38 ? 0 : pick < 0.7 ? 2 : pick < 0.88 ? 1 : 3];
  const light = luminance(color) > 0.3;
  const look: Look = {
    color,
    fg: light ? "#2a2520" : "#f6efe2",
    light,
    style: STYLES[Math.floor(r() * STYLES.length)],
    w: Math.round(Math.min(74, Math.max(30, 22 + Math.sqrt(b.minutes) * 4.8))),
    h: Math.round(204 + r() * 54),
    hue: hueOf(color),
  };
  looks.set(key, look);
  return look;
}

/* ---------- pictures ---------- */

export const topicArtSrc = (k: TopicKey) => `/library/topics/${k}.webp`;
export const iconSrc = (k: TopicKey | TagKey) => `/library/icons/${k}.webp`;

/* ---------- shelving ---------- */

export type Sort = "topic" | "recent" | "color" | "length";

export const SORTS: { key: Sort; label: string }[] = [
  { key: "topic", label: "تېما" },
  { key: "recent", label: "يېقىنقى" },
  { key: "color", label: "رەڭ" },
  { key: "length", label: "ئۇزۇنلۇقى" },
];

const TOPIC_ORDER = Object.fromEntries(TOPICS.map((t, i) => [t.key, i])) as Record<TopicKey, number>;

export function sortBooks(books: Book[], sort: Sort): Book[] {
  const by = [...books];
  if (sort === "topic") by.sort((a, b) => TOPIC_ORDER[a.topic] - TOPIC_ORDER[b.topic] || a.added - b.added);
  if (sort === "recent") by.sort((a, b) => b.added - a.added);
  if (sort === "color") by.sort((a, b) => lookOf(a).hue - lookOf(b).hue || lookOf(a).h - lookOf(b).h);
  if (sort === "length") by.sort((a, b) => a.minutes - b.minutes);
  return by;
}

/** The label on the shelf under the first book of each run: a topic, a month or a length. */
export function groupOf(b: Book, sort: Sort): { key: string; label: string; icon?: TopicKey | TagKey } | null {
  if (sort === "topic") return { key: b.topic, label: TOPIC[b.topic].name, icon: b.topic };
  if (sort === "recent") {
    const label = new Date(b.added).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { key: label, label };
  }
  if (sort === "length") {
    if (b.minutes < 10) return { key: "quick", label: "10 مىنۇتتىن ئاز", icon: "quick" };
    if (b.minutes < 30) return { key: "sitting", label: "بىر ئولتۇرۇشتا" };
    return { key: "long", label: b.minutes < 60 ? "An evening" : "A weekend", icon: "long" };
  }
  return null;
}

/* ---------- tags you can filter by ---------- */

export type TagKey = "favorite" | "reading" | "finished" | "quick" | "long" | "agent";

export const TAGS: { key: TagKey; label: string; test: (b: Book) => boolean }[] = [
  { key: "reading", label: "ھازىر ئوقۇۋاتقان", test: (b) => b.pct > 0 && b.pct < 1 },
  { key: "favorite", label: "ياقتۇرغانلار", test: (b) => b.favorite },
  { key: "finished", label: "تۈگىگەن", test: (b) => b.pct >= 1 },
  { key: "quick", label: "10 مىنۇتتىن ئاز", test: (b) => b.minutes < 10 },
  { key: "long", label: "ئۇزۇن ئوقۇشلار", test: (b) => b.minutes >= 45 },
  { key: "agent", label: "ۋاكالەتچىڭىزدىن", test: (b) => b.agent },
];

export const tagsOf = (b: Book) => TAGS.filter((t) => t.key !== "agent" && t.test(b));

export const fmtMinutes = (m: number) => (m < 60 ? `${m} مىنۇت` : `${Math.floor(m / 60)} سائەت${m % 60 ? ` ${m % 60} مىنۇت` : ""}`);

export const hostOf = (url?: string) => {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

/** A year from what an importer found ("2019", an ISO date), when it is a plausible one. */
export function yearOf(published?: string): number | undefined {
  const y = Number(published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1]);
  return y && y <= new Date().getFullYear() + 1 ? y : undefined;
}

/* ---------- what the classifier returns ---------- */

export type Shelving = { topic: TopicKey; tags: string[]; scene?: string };

/** Tags: a few short lowercase words, never the topic's own name. */
export function cleanTags(v: unknown, topic: TopicKey): string[] {
  if (!Array.isArray(v)) return [];
  const name = TOPIC[topic].name.toLowerCase();
  const out: string[] = [];
  for (const t of v) {
    if (typeof t !== "string") continue;
    const s = t.toLowerCase().replace(/[^a-z0-9 &+.-]/g, "").replace(/\s+/g, " ").trim();
    if (s.length > 32) continue;
    if (s && s !== name && !out.includes(s)) out.push(s);
    if (out.length === 3) break;
  }
  return out;
}
