"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopBar } from "@/components/ui/TopBar";
import { wordCount, type Article } from "@/lib/article";
import { importFromFile, importFromText, importFromUrl, keep, looksLikeUrl } from "@/lib/import";
import { hideSample, useLibraryPrefs } from "@/lib/library-prefs";
import { normalizeUrl } from "@/lib/links";
import { SAMPLES } from "@/lib/samples";
import { applySettings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { Hero } from "./Hero";
import { HomeBelow } from "./HomeBelow";
import { ImportBar, type Busy } from "./ImportBar";
import { PasteSheet } from "./PasteSheet";
import { LibraryLine, type Saved } from "./LibraryLine";
import { ShelfSheet, type ShelfItem } from "./ShelfSheet";

/** One screen: a headline that shows what it does, a place to paste, and your shelf. */
export function Landing({ signedIn: signedInAtLoad = false }: { signedIn?: boolean }) {
  const router = useRouter();
  // Known on the server at load, so a signed-in reader never sees the demo flash; then live, for a sign-in from this page.
  const { isLoaded, isSignedIn } = useAuth();
  const signedIn = isLoaded ? Boolean(isSignedIn) : signedInAtLoad;
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const progress = useStore((s) => s.progress);
  const glosses = useStore((s) => s.glosses);
  const removeFromLibrary = useStore((s) => s.removeFromLibrary);
  const shelve = useStore((s) => s.shelve);
  const { hiddenSamples } = useLibraryPrefs();

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorNeedsKey, setErrorNeedsKey] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    hydrate();
    applySettings(useStore.getState().settings);
  }, [hydrate]);

  // Leave with a soft fade, so the page turns rather than cuts.
  const go = useCallback(
    (id: string, hl?: string) => {
      setLeaving(true);
      setTimeout(() => router.push(`/read/${id}${hl ? `?hl=${hl}` : ""}`), 240);
    },
    [router]
  );

  const finish = useCallback(
    async (a: Article, file?: Blob) => {
      const err = await keep(a, file);
      if (err) {
        setError(err);
        setBusy(null);
        return;
      }
      go(a.id);
    },
    [go]
  );

  const fromUrl = useCallback(
    async (raw: string, later = false) => {
      if (!raw.trim()) return;
      setError(null);
      setSaved(null);
      let host = raw.trim();
      try {
        host = new URL(/^https?:/i.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, "");
      } catch {}
      setBusy({ label: `${later ? "Saving" : "Reading"} ${host}` });
      // A link to a PDF is read here in the browser, with its progress in the bar.
      const r = await importFromUrl(raw, (p, label) => setBusy({ label: label ?? `Reading ${host}`, pct: p }));
      if (!r.ok) {
        setError(r.error);
        setErrorNeedsKey(Boolean(r.needKey));
        setBusy(null);
        return;
      }
      if (!later) return finish(r.article, r.file);
      const err = await keep(r.article, r.file);
      setBusy(null);
      if (err) return setError(err);
      setUrl("");
      setSaved({ id: r.article.id, title: r.article.title, bookmark: Boolean(r.article.bookmark) });
    },
    [finish]
  );

  // A link handed in from elsewhere, by the bookmarklet or a share: /?url=… opens it, /?save=… shelves it for later.
  const handed = useRef(false);
  useEffect(() => {
    if (!hydrated || handed.current) return;
    handed.current = true;
    const q = new URLSearchParams(window.location.search);
    const later = q.has("save");
    const raw = (q.get("save") ?? q.get("url") ?? "").trim();
    if (!raw) return;
    // Off the address bar, so a reload or a shared screenshot does not import it again.
    window.history.replaceState(null, "", "/");
    if (!looksLikeUrl(raw)) return setError("That does not look like a link.");
    const known = useStore.getState().library.find((x) => x.sourceUrl && normalizeUrl(x.sourceUrl) === normalizeUrl(raw));
    if (known) return later ? setSaved({ id: known.id, title: known.title }) : go(known.id);
    setUrl(raw);
    void fromUrl(raw, later);
  }, [hydrated, fromUrl, go]);

  const fromFile = useCallback(
    async (f: File) => {
      setError(null);
      setErrorNeedsKey(false);
      setBusy({ label: `Opening ${f.name}`, pct: f.name.toLowerCase().endsWith(".pdf") ? 0 : undefined });
      // The PDF reader reports what it is doing: "Reading 12 pages", then any scanned ones.
      const r = await importFromFile(f, (p, label) => setBusy({ label: label ?? `Reading ${f.name}`, pct: p }));
      if (r.ok) finish(r.article, r.file);
      else {
        setError(r.error);
        setErrorNeedsKey(Boolean(r.needKey));
        setBusy(null);
      }
    },
    [finish]
  );

  const fromText = useCallback(
    (text: string) => {
      const r = importFromText(text);
      setPasteOpen(false);
      if (r.ok) finish(r.article);
      else setError(r.error);
    },
    [finish]
  );

  // Paste a link or a page of text anywhere. Drop a file anywhere. Slash to type.
  useEffect(() => {
    const inField = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target) || busy) return;
      const t = e.clipboardData?.getData("text") ?? "";
      if (looksLikeUrl(t)) {
        e.preventDefault();
        setUrl(t.trim());
        fromUrl(t);
      } else if (t.trim().split(/\s+/).length >= 40) {
        e.preventDefault();
        fromText(t);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target) || e.metaKey || e.ctrlKey) return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const leave = () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) fromFile(f);
    };
    document.addEventListener("paste", onPaste);
    window.addEventListener("keydown", onKey);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [busy, fromUrl, fromFile, fromText]);

  const items: ShelfItem[] = useMemo(() => {
    const p = (id: string) => (hydrated ? progress[id]?.pct ?? 0 : 0);
    const g = (id: string) => (hydrated ? (glosses[id] ?? []).length : 0);
    const mine = library.map((x) => ({
      id: x.id,
      title: x.title,
      byline: x.author || x.source || (x.origin === "paste" ? "Pasted text" : "Imported"),
      words: x.words,
      pct: p(x.id),
      glosses: g(x.id),
      sample: false,
      touched: (hydrated ? progress[x.id]?.at : 0) || x.addedAt,
    }));
    const samples = SAMPLES.filter((a) => !hiddenSamples.includes(a.id)).map((a) => ({
      id: a.id,
      title: a.title,
      byline: [a.author?.split(" ").slice(-1)[0], a.published].filter(Boolean).join(", "),
      dek: a.dek,
      words: wordCount(a),
      pct: p(a.id),
      glosses: g(a.id),
      sample: true,
      touched: hydrated ? progress[a.id]?.at ?? 0 : 0,
    }));
    // What you are in the middle of comes first, then whatever was touched last.
    const reading = (x: ShelfItem) => Number(x.pct > 0 && x.pct < 1);
    return [...mine, ...samples].sort((a, b) => reading(b) - reading(a) || b.touched - a.touched);
  }, [library, progress, glosses, hydrated, hiddenSamples]);

  return (
    <div className={`landing relative z-[1] flex min-h-dvh flex-col transition-[opacity,filter,transform] duration-300 ease-[var(--ease-out)] ${leaving ? "scale-[0.995] opacity-0 blur-[2px]" : ""}`}>
      <TopBar />

      {/* One screen: the headline and the link bar centred in the room above, and the desk at the foot. */}
      <main className="relative flex flex-1 flex-col pb-[clamp(20px,4vh,44px)]">
        <div className="flex flex-1 flex-col justify-center pb-[clamp(16px,3vh,36px)] pt-[clamp(28px,8vh,96px)]">
          <Hero>
            <ImportBar
              ref={inputRef}
              url={url}
              setUrl={setUrl}
              busy={busy}
              error={error}
              errorNeedsKey={errorNeedsKey}
              onSubmit={fromUrl}
              onSave={(u) => fromUrl(u, true)}
              onPickFile={() => fileRef.current?.click()}
              onPasteText={() => setPasteOpen(true)}
            />
            <LibraryLine saved={saved} />
          </Hero>
        </div>
        <HomeBelow signedIn={signedIn} />
      </main>

      <ShelfSheet
        items={items}
        onOpen={go}
        onRename={(id, title) => shelve(id, { title })}
        onRemove={(it) => (it.sample ? hideSample(it.id) : removeFromLibrary(it.id))}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) fromFile(f);
          e.target.value = "";
        }}
      />
      <PasteSheet open={pasteOpen} onClose={() => setPasteOpen(false)} onRead={fromText} />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-bg/80 backdrop-blur-sm" style={{ animation: "fade 0.15s" }}>
          <div className="rounded-[28px] border-[1.5px] border-dashed border-[var(--rubric)] px-16 py-14 text-center">
            <p className="font-serif text-[40px] leading-none text-ink">Drop to read</p>
            <p className="mt-3 text-[14px] text-ink-3">PDF, .txt or .md</p>
          </div>
        </div>
      )}
    </div>
  );
}
