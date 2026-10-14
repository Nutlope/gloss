"use client";

import type { Action } from "./actions";
import type { BriefData } from "./article";
import { docPayload, type DocIndex } from "./doc";
import { uid, useStore, type Anchor, type Gloss, type Turn } from "./store";
import type { ModelKey, StreamEvent, Usage } from "./models";
import { MODELS, modelOf } from "./models";

const KEY_STORAGE = "together:api-key";

export function readApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

const controllers = new Map<string, AbortController>();

export function stopGloss(id: string) {
  controllers.get(id)?.abort();
  controllers.delete(id);
}

function lastAssistant(g: Gloss, fn: (t: Turn) => Turn): Gloss {
  const turns = g.turns.slice();
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "assistant") {
      turns[i] = fn(turns[i]);
      break;
    }
  }
  return { ...g, turns };
}

/** Streams the newest assistant turn of a gloss from /api/ask. */
async function stream(ix: DocIndex, glossId: string, modelKey: ModelKey) {
  const st = useStore.getState();
  const articleId = ix.article.id;
  const g = (st.glosses[articleId] ?? []).find((x) => x.id === glossId);
  if (!g) return;

  // History after the first answer: alternating user/assistant, ending with the new user turn.
  const history = g.turns
    .slice(1, -1)
    .filter((t) => !t.error)
    .map((t) => ({ role: t.role, content: t.content }));

  const from = g.anchor ? ix.numbers.get(g.anchor.start.b) : undefined;
  const to = g.anchor ? ix.numbers.get(g.anchor.end.b) : undefined;
  const at = g.at ? ix.numbers.get(g.at) : undefined;

  const ctrl = new AbortController();
  controllers.set(glossId, ctrl);
  const update = (fn: (t: Turn) => Turn) => useStore.getState().updateGloss(articleId, glossId, (x) => lastAssistant(x, fn));

  try {
    const apiKey = readApiKey();
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        apiKey: apiKey || undefined,
        model: modelKey,
        length: st.settings.length,
        doc: docPayload(ix, g.anchor?.start.b ?? g.at),
        thread: { action: g.action, quote: g.anchor?.quote, from, to, at, question: g.question },
        history,
        search: st.settings.search,
      }),
    });
    noteFree(res);
    if (!res.ok || !res.body) {
      const { error, needKey } = await failure(res);
      update((t) => ({ ...t, streaming: false, error, needKey }));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let pending = "";
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (!pending) return;
      const chunk = pending;
      pending = "";
      update((t) => ({ ...t, content: t.content + chunk }));
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const f of frames) {
        if (!f.startsWith("data:")) continue;
        let e: StreamEvent;
        try {
          e = JSON.parse(f.slice(5).trim());
        } catch {
          continue;
        }
        if (e.type === "content") {
          // Batch tokens into animation frames so a fast model never janks the page.
          pending += e.text;
          if (!raf) raf = requestAnimationFrame(flush);
        } else if (e.type === "meta") update((t) => ({ ...t, model: e.model }));
        else if (e.type === "reset") {
          // A line written before a web search ("Let me look that up") gives way to the answer.
          pending = "";
          update((t) => ({ ...t, content: "" }));
        } else if (e.type === "searching") update((t) => ({ ...t, searching: true }));
        else if (e.type === "sources") update((t) => ({ ...t, searching: false, sources: e.sources }));
        else if (e.type === "usage") update((t) => ({ ...t, usage: e.usage }));
        else if (e.type === "error") {
          flush();
          update((t) => ({ ...t, streaming: false, error: e.text }));
        }
      }
    }
    if (raf) cancelAnimationFrame(raf);
    flush();
  } catch (err) {
    if (ctrl.signal.aborted) update((t) => ({ ...t, streaming: false, error: t.content ? undefined : "توختىتىلدى." }));
    else update((t) => ({ ...t, streaming: false, error: `ئۇلىنىش ئۈزۈلدى: ${String(err)}` }));
  } finally {
    controllers.delete(glossId);
    update((t) => ({ ...t, streaming: false, searching: false }));
  }
}

export function startGloss(
  ix: DocIndex,
  opts: { anchor?: Anchor; at?: string; action: Action; question?: string; modelKey?: ModelKey }
): string {
  const st = useStore.getState();
  const modelKey = modelOf(opts.modelKey ?? st.settings.model);
  // The answer is written in the margin, which focus mode hides: step out of it.
  if (st.focusMode) st.setUI({ focusMode: false });
  const g: Gloss = {
    id: uid(),
    articleId: ix.article.id,
    anchor: opts.anchor,
    at: opts.at,
    action: opts.action,
    question: opts.question,
    createdAt: Date.now(),
    turns: [{ role: "assistant", content: "", streaming: true, modelKey, model: MODELS[modelKey].label }],
  };
  st.addGloss(g);
  void stream(ix, g.id, modelKey);
  return g.id;
}

export function followUp(ix: DocIndex, glossId: string, question: string, modelKey?: ModelKey) {
  const st = useStore.getState();
  const mk = modelOf(modelKey ?? st.settings.model);
  st.updateGloss(ix.article.id, glossId, (g) => ({
    ...g,
    turns: [
      ...g.turns,
      { role: "user", content: question },
      { role: "assistant", content: "", streaming: true, modelKey: mk, model: MODELS[mk].label },
    ],
  }));
  void stream(ix, glossId, mk);
}

/** Re-runs the latest answer, optionally on a different model. */
export function retry(ix: DocIndex, glossId: string, modelKey?: ModelKey) {
  const st = useStore.getState();
  const mk = modelOf(modelKey ?? st.settings.model);
  st.updateGloss(ix.article.id, glossId, (g) =>
    lastAssistant(g, () => ({ role: "assistant", content: "", streaming: true, modelKey: mk, model: MODELS[mk].label }))
  );
  void stream(ix, glossId, mk);
}

export async function fetchBrief(ix: DocIndex) {
  const st = useStore.getState();
  const id = ix.article.id;
  const modelKey = modelOf(st.settings.model);
  st.setBrief(id, { status: "loading" });
  try {
    const apiKey = readApiKey();
    const res = await fetch("/api/brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: apiKey || undefined, model: modelKey, doc: docPayload(ix) }),
    });
    noteFree(res);
    const j = (await res.json()) as { brief?: BriefData; usage?: Usage; error?: string; code?: string };
    if (j.brief) useStore.getState().setBrief(id, { status: "ready", data: j.brief, usage: j.usage, modelKey, at: Date.now() });
    else useStore.getState().setBrief(id, { status: "error", error: j.error ?? "Could not write the gloss.", needKey: j.code === "need_key" });
  } catch (e) {
    useStore.getState().setBrief(id, { status: "error", error: `ئۇلىنىش ئۈزۈلدى: ${String(e)}` });
  }
}

/** Tell the key menu how many free answers are left today, when the server says. */
function noteFree(res: Response) {
  const left = res.headers.get("X-Free-Left");
  if (left !== null) window.dispatchEvent(new CustomEvent("gloss:free", { detail: Number(left) }));
}

/** A failed request's message, and whether the fix is the reader's own key. */
async function failure(res: Response): Promise<{ error: string; needKey: boolean }> {
  try {
    const j = (await res.json()) as { error?: string; code?: string };
    return { error: j.error ?? `Request failed (${res.status}).`, needKey: j.code === "need_key" };
  } catch {
    return { error: `تەلەپ مەغلۇپ بولدى (${res.status}).`, needKey: false };
  }
}

/** Open the key menu in the top bar, from anywhere. */
export function openKeyMenu() {
  window.dispatchEvent(new Event("gloss:key"));
}

export async function validateKey(key: string): Promise<boolean> {
  try {
    const res = await fetch("/api/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key }) });
    return ((await res.json()) as { ok?: boolean }).ok === true;
  } catch {
    return false;
  }
}

/**
 * A one-off streamed answer outside the reader (the landing page's try-it).
 * Calls back with the growing text; resolves when the stream ends.
 */
export async function streamAsk(
  body: Record<string, unknown>,
  on: { text: (full: string) => void; error?: (msg: string) => void },
  signal?: AbortSignal
) {
  let full = "";
  try {
    const apiKey = readApiKey();
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ ...body, apiKey: apiKey || undefined, model: modelOf(useStore.getState().settings.model) }),
    });
    noteFree(res);
    if (!res.ok || !res.body) {
      on.error?.((await failure(res)).error);
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const f of frames) {
        if (!f.startsWith("data:")) continue;
        const e = JSON.parse(f.slice(5).trim()) as StreamEvent;
        if (e.type === "content") {
          full += e.text;
          on.text(full);
        } else if (e.type === "error") on.error?.(e.text);
      }
    }
  } catch (e) {
    if (!signal?.aborted) on.error?.(`Connection lost: ${String(e)}`);
  }
}
