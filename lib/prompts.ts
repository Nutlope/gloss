import type { Action } from "./actions";
import type { ChatMessage } from "./together";

export type DocPayload = {
  title: string;
  author?: string;
  published?: string;
  paras: { n: number; text: string }[];
  /** True when only a window of a long document was sent. */
  partial?: boolean;
};

export type ThreadPayload = {
  action: Action;
  quote?: string;
  from?: number;
  to?: number;
  at?: number;
  question?: string;
};

/**
 * The system message carries the whole text and nothing that varies per
 * question, so Together's prefix cache serves every follow-up on the same
 * article at the cached rate (about 2% of the fresh input price on Flash).
 */
export function systemFor(doc: DocPayload): string {
  const byline = [doc.author, doc.published].filter(Boolean).join(", ");
  const body = doc.paras.map((p) => `[¶${p.n}] ${p.text}`).join("\n\n");
  return `You are Gloss, a reading companion. You write short notes in the margin of a text someone is studying closely. Think of a sharp, generous scholar leaning over their shoulder.

THE TEXT: "${doc.title}"${byline ? ` by ${byline}` : ""}.
Paragraphs are numbered [¶n]; the reader sees the same numbers in the margin.${doc.partial ? "\nOnly part of a long text is included below; say so if a question needs the rest." : ""}

<text>
${body}
</text>

How to write a gloss:
- Answer directly. No preamble, no restating the question, no sign-off.
- Lead with the answer and mark it: wrap the words a skimmer most needs (the direct answer itself, from a few words up to one sentence) in ==double equals==, exactly once per reply. Example: "==It is a joke at his own expense.== The line before ..." Never mark a citation or a whole paragraph.
- Plain, vivid prose. Short paragraphs. Use a list only for several distinct pointers.
- Keep to the length the reader asked for (given after the text). Brevity is respect for their attention.
- When you refer to the text, cite it inline as [¶n]. Only cite paragraphs that exist above.
- Keep the author's meaning separate from outside knowledge. When you bring in something the text does not say, mark it, for example "Outside the text, ...".
- If something is uncertain or disputed, say so plainly.
- Use **bold** sparingly for a key term. Never use headings.
- Never use em dashes or en dashes. Use commas, colons, parentheses or a plain hyphen.
- Language: always write your reply in Uyghur (Arabic script), whatever language the text or question is in. Keep quotations from the text in their original language, and keep citations like [¶n] and [1] exactly as they are.`;
}

function where(t: ThreadPayload): string {
  if (t.from && t.to && t.to !== t.from) return `[¶${t.from}] to [¶${t.to}]`;
  if (t.from) return `[¶${t.from}]`;
  return "";
}

const TASKS: Record<Exclude<Action, "ask">, string> = {
  explain:
    "Explain what this passage means and what work it is doing at this point in the text. If it names a person, organisation, place or work, say who or what it is. If it uses archaic phrasing or a metaphor, unpack it; if it does not, do not mention it. 2 to 4 sentences.",
  define:
    "Define this as it is used here, in one or two sentences. Only if it is archaic, technical or used in an unusual sense, say so and give the plain modern equivalent. Never remark that a word is standard, common or not archaic.",
  simplify:
    "Rewrite this in plain, modern Uyghur (Arabic script) that keeps the full meaning. Then add one short line on the point it makes.",
  check:
    "Does this still hold up? Compare it with current knowledge: say what has held up, what has changed, and how confident you are. This task is mostly outside the text, so mark it as such. 3 to 5 sentences.",
  connect:
    "Where else does the text develop, support or complicate this? Give 2 to 4 pointers as a list, each one line that starts with its citation, like [¶12].",
  counter:
    "Give the strongest objection or alternative reading a sharp critic would raise against this, in 2 or 3 sentences. Then one line on how the author might answer.",
};

/** The first user turn of a thread. Follow-ups are appended as plain turns. */
export function firstTurn(t: ThreadPayload): string {
  if (t.quote) {
    const loc = where(t);
    const head = `The reader selected this${loc ? ` in ${loc}` : ""}:\n«${t.quote.trim()}»`;
    if (t.action === "ask") return `${head}\n\nTheir question: ${t.question?.trim() || "What should I understand here?"}`;
    return `${head}\n\nTask: ${TASKS[t.action]}`;
  }
  // Whole-text question, asked from a reading position.
  const at = t.at ? `The reader is currently around [¶${t.at}].\n\n` : "";
  return `${at}Their question about the whole text: ${t.question?.trim() || "What is this text about?"}`;
}

const LENGTHS = {
  short: "Length: very short. One to three sentences, under 50 words, unless a list of pointers is asked for.",
  normal: "Length: concise. Under 90 words unless the task asks for more.",
  long: "Length: thorough. Up to about 180 words, still with no filler.",
} as const;

export type LengthKey = keyof typeof LENGTHS;
export const isLengthKey = (v: unknown): v is LengthKey => typeof v === "string" && v in LENGTHS;

/** When web_search is offered: when to use it, and how. After the text, so the cached prefix is unchanged. */
const TOOL_NOTE = `You can call web_search. Use it when the question turns on something the text does not explain: a specific person, organisation, place, work or event named in the selection, or anything that may have changed since the text was written. Do not use it for what the text says or for plain word meanings. If you use it, call it straight away, with no words before the call. Cite what a result says as [1], [2] and keep [¶n] for the text.`;

export function buildMessages(
  doc: DocPayload,
  thread: ThreadPayload,
  history: { role: "user" | "assistant"; content: string }[] = [],
  length: LengthKey = "normal",
  web?: string,
  tool = false
): ChatMessage[] {
  // The length note and any web results come after the document, so the cached prefix is unchanged.
  return [
    { role: "system", content: systemFor(doc) },
    { role: "system", content: LENGTHS[length] },
    ...(web ? [{ role: "system" as const, content: web }] : []),
    ...(tool ? [{ role: "system" as const, content: TOOL_NOTE }] : []),
    { role: "user", content: firstTurn(thread) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
}

/** Web results as the model sees them: numbered, dated, with the excerpts Exa found relevant. */
export function webBlock(sources: { n: number; title: string; site: string; date?: string }[], excerpts: string[], today = new Date().toISOString().slice(0, 10)): string {
  const list = sources.map((s, i) => `[${s.n}] ${s.title} (${s.site}${s.date ? `, ${s.date}` : ""})\n${excerpts[i]}`).join("\n\n");
  return `WEB RESULTS, searched ${today} for this question:

${list}

How to use them: they are outside the text, so say so. Cite a web result inline as [1] or [2], next to the claim it supports, and keep [¶n] for what the text itself says. Only cite what a result actually states. Prefer recent, primary sources; if the results disagree or do not settle the question, say that plainly.`;
}

/**
 * The brief. A reader takes it as a verdict on the text, so it reports what
 * the evidence shows rather than the text's own headline: a paper's abstract
 * can round its results one way and its tables another.
 */
export const BRIEF_TASK = `Read the whole text and return JSON only, with this shape:
{
  "gist": "two sentences: what this text argues and why it matters",
  "claims": [{ "text": "one sentence", "cite": 12 }],
  "caveats": [{ "text": "one sentence", "cite": 40 }],
  "sections": [{ "title": "2 to 5 words", "start": 1 }]
}
Rules:
- 3 to 5 claims, each citing the single paragraph that best supports it. Together they carry the text's load-bearing ideas in its own order: what it argues and how it gets there, then what its evidence shows. No more than two claims are results.
- Numbers come from the text's evidence (its tables and data), never from a sentence that sums them up (an abstract, introduction, conclusion, or prose that restates a table), and cite the paragraph that holds them. Check every summary figure against the table it summarizes before you repeat it: when they disagree, use what the table shows and add a caveat that the summary says otherwise. Prefer figures the table reports outright, like "89.8% against 92.3%", over averages or ranges you would have to work out.
- Make every comparison exactly as strong as the evidence. Give the numbers instead of words like "matches", "approaches" or "outperforms", and say where it falls short or loses.
- The gist claims no more than the claims do.
- 1 to 3 caveats: what a careful reader should keep in mind before relying on this text. Look for the limits of its scope (which data, models, settings, people or cases it covers, and what it never tests), its standing (a preprint not yet peer reviewed, an opinion piece, a single study), what the author concedes, and any place its headline goes beyond its own evidence. Each caveat must be true of this text and cite the paragraph that shows it, or 0 when it is about something the text leaves out. An empty list only when nothing applies.
- 4 to 8 sections that cover the text in order: "start" is the first paragraph number of each section, ascending, and the first section starts at the first paragraph. Section titles are sentence case and specific to this text.
- Write every string value (gist, claims, caveats, section titles) in Uyghur (Arabic script). Keep the JSON keys and numbers exactly as specified.
- Never use em dashes or en dashes.`;
