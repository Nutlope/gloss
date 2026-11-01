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
  { key: "ai", name: "AI", shades: ["#5b4a9e", "#7a68bf", "#3b2f6e", "#a597d6"], inks: "deep violet and soft lavender", hint: "machine learning, language models, AI research, AI products and agents", blurb: "Machines that learn: models, agents, research and what it all means." },
  { key: "programming", name: "Programming", shades: ["#2f4f8f", "#4a6fb3", "#1d3263", "#8aa6d8"], inks: "navy blue and cornflower blue", hint: "software engineering, languages, code, developer tools, open source, engineering practice", blurb: "How software is made, and the people who make it." },
  { key: "infra", name: "Infrastructure", shades: ["#6b6a2a", "#8b8a43", "#4a491a", "#bdbb7f"], inks: "olive and pale khaki", hint: "systems, cloud, GPUs, inference, databases, distributed systems, performance, devops", blurb: "The machinery underneath: systems, chips, clouds and the bills that come with them." },
  { key: "data", name: "Data", shades: ["#2a6f8a", "#4a90a8", "#1a4c60", "#8fc0d0"], inks: "petrol blue and pale aqua", hint: "data science, analytics, statistics, visualisation, data engineering", blurb: "Counting things carefully, and showing what the numbers say." },
  { key: "security", name: "Security", shades: ["#3d4a52", "#5b6a73", "#262f35", "#9aa8b0"], inks: "slate grey and steel blue", hint: "security, privacy, cryptography, attacks, trust", blurb: "Locks, keys, and the people trying both." },
  { key: "tech", name: "Tech & internet", shades: ["#3e6c9e", "#5e8cbe", "#284b70", "#a3c2e2"], inks: "cobalt and sky blue", hint: "the tech industry, platforms, internet culture, gadgets, big tech news", blurb: "The industry, the platforms and the internet we live on." },
  { key: "design", name: "Design", shades: ["#c0603a", "#d9805a", "#8f4224", "#efb698"], inks: "coral and apricot", hint: "design, UX, typography, interfaces, craft, architecture", blurb: "How things look, feel and work." },
  { key: "product", name: "Product", shades: ["#8a5a9e", "#a87abb", "#62406f", "#cfb0dc"], inks: "mauve and lilac", hint: "product management, building products, user research, launches, growth", blurb: "Deciding what to build, and finding out if it worked." },
  { key: "startups", name: "Startups", shades: ["#a43848", "#c65767", "#782333", "#e39aa5"], inks: "crimson and dusty rose", hint: "startups, founders, fundraising, venture capital, go to market", blurb: "Building things people want, from the first users onward." },
  { key: "business", name: "Business", shades: ["#7a5230", "#9a7050", "#563820", "#c9a585"], inks: "walnut brown and tan", hint: "companies, strategy, management, markets, competition", blurb: "Companies, strategy and how markets move." },
  { key: "work", name: "Work & careers", shades: ["#7a4b32", "#9a6a4e", "#563220", "#c9a088"], inks: "chestnut brown and soft peach", hint: "careers, hiring, leadership, teams, productivity at work, remote work", blurb: "Jobs, teams, and doing good work for a long time." },
  { key: "economics", name: "Economics", shades: ["#40705a", "#5f9078", "#2a4e3e", "#a0c8b4"], inks: "jade green and mint", hint: "economics, policy, trade, labour markets, macro", blurb: "Incentives, trade-offs and how the whole system behaves." },
  { key: "money", name: "Money", shades: ["#8a7a20", "#a89838", "#5f5410", "#d6ca82"], inks: "old gold and pale brass", hint: "personal finance, investing, markets, crypto", blurb: "Saving, investing and the stories we tell about money." },
  { key: "science", name: "Science", shades: ["#3a6b45", "#5a8d5e", "#274a30", "#9cc29a"], inks: "forest green and sage", hint: "physics, biology, chemistry, maths, space, research and how science works", blurb: "How the world works, and how we find out." },
  { key: "health", name: "Health", shades: ["#b5485e", "#cf6a7e", "#86303f", "#eda9b6"], inks: "raspberry red and blush pink", hint: "health, medicine, fitness, nutrition, sleep", blurb: "Bodies, medicine and staying well." },
  { key: "mind", name: "Mind", shades: ["#4c5fa8", "#6c7ec4", "#33427a", "#aab6e6"], inks: "periwinkle and indigo", hint: "psychology, neuroscience, behaviour, habits, decision making", blurb: "Why we think, feel and decide the way we do." },
  { key: "climate", name: "Climate & energy", shades: ["#4f7f3a", "#6f9f55", "#355a25", "#aed096"], inks: "leaf green and lime", hint: "climate change, energy, environment, sustainability", blurb: "Energy, the planet and what we do next." },
  { key: "philosophy", name: "Philosophy", shades: ["#5e4b7a", "#7c6a99", "#3f3154", "#b9acd0"], inks: "plum grey and heather", hint: "philosophy, ethics, religion, meaning, big ideas", blurb: "The old questions, still open." },
  { key: "history", name: "History", shades: ["#8c5a2b", "#aa7745", "#633e1a", "#d9b48a"], inks: "sepia brown and parchment ochre", hint: "history, biography, how things came to be", blurb: "How we got here." },
  { key: "politics", name: "Politics & society", shades: ["#9a3a2e", "#b85a4c", "#6e261d", "#e0a196"], inks: "brick red and pale terracotta", hint: "politics, government, law, society, current affairs, cities", blurb: "Power, policy and how we live together." },
  { key: "culture", name: "Culture", shades: ["#b0447e", "#c9669a", "#82305b", "#e8a9cb"], inks: "magenta and pink", hint: "art, film, music, books, games, media, criticism", blurb: "Art, film, music, games and the things we love." },
  { key: "writing", name: "Writing", shades: ["#b0502d", "#cc7147", "#86381c", "#e6a580"], inks: "terracotta and burnt orange", hint: "writing, language, storytelling, journalism, communication", blurb: "Words, sentences and the craft of saying things clearly." },
  { key: "learning", name: "Learning", shades: ["#2c7a76", "#4c9b94", "#1c5654", "#8cc4bd"], inks: "deep teal and pale sea-green", hint: "education, learning, teaching, memory, tools for thought, note-taking", blurb: "How we learn, remember and think with tools." },
  { key: "living", name: "Living", shades: ["#b0841f", "#cda03a", "#835f15", "#e5c97a"], inks: "mustard ochre and olive green", hint: "life, relationships, attention, time, happiness, personal essays, food, travel", blurb: "Attention, time and the rest of life." },
  { key: "unsorted", name: "Unsorted", shades: ["#5d5a55", "#7b776f", "#3f3d39", "#aaa59b"], inks: "warm grey and charcoal", hint: "", blurb: "Not shelved yet. Gloss sorts new texts as they arrive." },
];

export const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.key, t])) as Record<TopicKey, Topic>;
export const isTopic = (v: unknown): v is TopicKey => typeof v === "string" && v in TOPIC;

/* ---------- your own shelves ---------- */

/** A shelf the reader made themselves. Its key is stable; only the name changes on a rename. */
export type CustomShelf = { key: string; name: string; createdAt?: number };

export const CUSTOM_PREFIX = "custom-";
export const isCustomKey = (v: unknown): v is string => typeof v === "string" && v.startsWith(CUSTOM_PREFIX) && v.length > CUSTOM_PREFIX.length;

/** A stable key for a new shelf, from its name: `custom-reading-list`, then `-2`, `-3` on a clash. */
export function customKeyFor(name: string, existing: Iterable<string> = []): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 40) || "shelf";
  const taken = new Set(existing);
  let key = `${CUSTOM_PREFIX}${slug}`;
  for (let n = 2; taken.has(key); n++) key = `${CUSTOM_PREFIX}${slug}-${n}`;
  return key;
}

/** The name a custom key carries on its own, for a device that has not seen the shelf made. */
export function shelfNameFromKey(key: string): string {
  const words = key.slice(CUSTOM_PREFIX.length).replace(/-\d+$/, "").split("-").filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || "My shelf";
}

const CUSTOM_PALETTES: [string, string, string, string][] = [
  ["#7a3b5e", "#9a5a7f", "#552741", "#c99ab2"],
  ["#2f6f6a", "#4f8f89", "#1f4d4a", "#9cc4bf"],
  ["#8a6d2f", "#aa8f4f", "#5f4c1f", "#d6c08a"],
  ["#4a5d8a", "#6a7daa", "#323f5f", "#a3b0d0"],
  ["#8a4a2f", "#aa6a4a", "#5f331e", "#d0a389"],
  ["#3f6d4a", "#5f8d63", "#2a4b32", "#a3c49e"],
  ["#6d3f7a", "#8d5f97", "#4b2a55", "#bfa3c9"],
  ["#7a5a3b", "#99805e", "#553e28", "#c9b69a"],
  ["#2f5d7a", "#4f7d9a", "#1f4055", "#9ab8c9"],
  ["#7a2f3b", "#9a4f5a", "#551f27", "#c99aa1"],
];

/** Cloth for any shelf: a built-in topic's own, or one picked by hash for a custom shelf. */
export function shadesFor(key: string): [string, string, string, string] {
  if (isTopic(key)) return TOPIC[key].shades;
  return CUSTOM_PALETTES[hash(key) % CUSTOM_PALETTES.length];
}

export type ShelfDef = Topic & { custom?: boolean };

/** Any shelf as the library draws it: a built-in topic, a custom shelf, or Unsorted. */
export function shelfDef(key: string, customs: CustomShelf[] = []): ShelfDef {
  if (isTopic(key)) return TOPIC[key];
  if (isCustomKey(key)) {
    const found = customs.find((c) => c.key === key);
    const name = found?.name || shelfNameFromKey(key);
    return { key: key as TopicKey, name, shades: shadesFor(key), blurb: "Your own shelf.", hint: "", inks: "deep colour and soft colour", custom: true };
  }
  return TOPIC.unsorted;
}

/** Every shelf, in order: the built-in topics, then your own, then Unsorted. */
export function allShelves(customs: CustomShelf[] = []): ShelfDef[] {
  return [...TOPICS.filter((t) => t.key !== "unsorted"), ...customs.map((c) => shelfDef(c.key, customs)), TOPIC.unsorted];
}

/** A shelved value kept as it is when it names a real shelf (built-in or your own), else Unsorted. */
export const topicOf = (v: unknown, customs: CustomShelf[] = []): string =>
  isTopic(v) || isCustomKey(v) ? (v as string) : customs.some((c) => c.key === v) ? (v as string) : "unsorted";

/** One text as the shelves see it: the shelf entry, with your reading laid over it. */
export type Book = {
  id: string;
  title: string;
  author: string;
  year?: number;
  url?: string;
  /** A built-in topic key, or a custom shelf key (`custom-…`). */
  topic: string;
  /** The shelf's display name, when the reader's own shelves gave it one. */
  topicName?: string;
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
  /** Saved as a link to look at later, because the page had too little text to read here. */
  bookmark?: boolean;
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
  const shades = shadesFor(b.topic);
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

export const topicArtSrc = (k: string) => `/library/topics/${k}.webp`;
export const iconSrc = (k: string) => `/library/icons/${k}.webp`;
/** Whether a bundled clay icon exists for this key (built-in topics and tags; custom shelves draw their initial instead). */
export const hasIcon = (k: string) => isTopic(k) || ["favorite", "reading", "finished", "quick", "long", "agent"].includes(k);

/* ---------- shelving ---------- */

export type Sort = "topic" | "recent" | "color" | "length";

export const SORTS: { key: Sort; label: string }[] = [
  { key: "topic", label: "Topic" },
  { key: "recent", label: "Recent" },
  { key: "color", label: "Colour" },
  { key: "length", label: "Length" },
];

const TOPIC_ORDER = Object.fromEntries(TOPICS.map((t, i) => [t.key, i])) as Record<string, number>;
/** Built-ins in their order, then your own shelves by name, then Unsorted last. */
const shelfOrder = (key: string) => (key === "unsorted" ? 999 : isTopic(key) ? TOPIC_ORDER[key] : 500);

export function sortBooks(books: Book[], sort: Sort): Book[] {
  const by = [...books];
  if (sort === "topic") by.sort((a, b) => shelfOrder(a.topic) - shelfOrder(b.topic) || (a.topicName ?? a.topic).localeCompare(b.topicName ?? b.topic) || a.added - b.added);
  if (sort === "recent") by.sort((a, b) => b.added - a.added);
  if (sort === "color") by.sort((a, b) => lookOf(a).hue - lookOf(b).hue || lookOf(a).h - lookOf(b).h);
  if (sort === "length") by.sort((a, b) => a.minutes - b.minutes);
  return by;
}

/** The label on the shelf under the first book of each run: a topic, a month or a length. */
export function groupOf(b: Book, sort: Sort, customs: CustomShelf[] = []): { key: string; label: string; icon?: string } | null {
  if (sort === "topic") return { key: b.topic, label: b.topicName ?? shelfDef(b.topic, customs).name, icon: b.topic };
  if (sort === "recent") {
    const label = new Date(b.added).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    return { key: label, label };
  }
  if (sort === "length") {
    if (b.minutes < 10) return { key: "quick", label: "Under 10 min", icon: "quick" };
    if (b.minutes < 30) return { key: "sitting", label: "One sitting" };
    return { key: "long", label: b.minutes < 60 ? "An evening" : "A weekend", icon: "long" };
  }
  return null;
}

/* ---------- tags you can filter by ---------- */

export type TagKey = "favorite" | "reading" | "finished" | "quick" | "long" | "agent";

export const TAGS: { key: TagKey; label: string; test: (b: Book) => boolean }[] = [
  { key: "reading", label: "Reading now", test: (b) => b.pct > 0 && b.pct < 1 },
  { key: "favorite", label: "Favourites", test: (b) => b.favorite },
  { key: "finished", label: "Finished", test: (b) => b.pct >= 1 },
  { key: "quick", label: "Under 10 min", test: (b) => b.minutes < 10 },
  { key: "long", label: "Long reads", test: (b) => b.minutes >= 45 },
  { key: "agent", label: "From your agent", test: (b) => b.agent },
];

export const tagsOf = (b: Book) => TAGS.filter((t) => t.key !== "agent" && t.test(b));

export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

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

export type Shelving = { topic: string; tags: string[]; scene?: string };

/** Tags: a few short lowercase words, never the topic's own name. */
export function cleanTags(v: unknown, topic: string): string[] {
  if (!Array.isArray(v)) return [];
  const name = shelfDef(topic).name.toLowerCase();
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
