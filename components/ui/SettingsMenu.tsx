"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AlignJustify, AlignLeft, Focus, Headphones, Map as MapIcon, Minus, Paintbrush, Pilcrow, Plus, RotateCcw } from "lucide-react";
import { MODELS, type ModelKey } from "@/lib/models";
import { applySettings, DEFAULT_SETTINGS, FACES, MARKERS, PENS, resolveTheme, THEMES, type Settings } from "@/lib/settings";
import { useStore } from "@/lib/store";
import { Popover, barBtn } from "./Popover";
import { setLibraryPrefs, useLibraryPrefs } from "@/lib/library-prefs";

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid rounded-[10px] bg-sunk p-[3px]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[8px] text-[12.5px] font-medium transition-colors ${value === o.key ? "bg-pill text-ink shadow-[0_1px_2px_rgb(0_0_0/0.1)]" : "text-ink-3 hover:text-ink"}`}
        >
          {/* Optically centred: the pill's shadow weighs its bottom edge, so the label sits a pixel lower. */}
          <span className="inline-flex translate-y-px items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onChange, label, icon }: { on: boolean; onChange: (v: boolean) => void; label: string; icon: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex h-9 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] font-medium transition-colors ${
        on ? "border-transparent bg-rubric-wash text-rubric-text" : "border-rule text-ink-3 hover:border-rule-strong hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

/** A tiny page in each theme: its paper, its ink, and the pen's underline. */
function Swatch({ theme, on }: { theme: (typeof THEMES)[number]; on: boolean }) {
  const pen = (dark: boolean) => (dark ? "var(--pen-d)" : "var(--pen-l)");
  const face = "font-serif text-[15px] leading-none [font-variation-settings:'opsz'_36]";
  return (
    <span
      className={`relative flex h-[38px] w-full overflow-hidden rounded-[10px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.28)] outline-offset-2 transition-[outline-color] ${
        on ? "outline-2 outline-[var(--ink)] [outline-style:solid]" : "outline-2 outline-transparent [outline-style:solid] group-hover:outline-[var(--rule-strong)]"
      }`}
    >
      {theme.key === "auto" ? (
        <>
          <span className="flex flex-1 items-center justify-end" style={{ background: "#f6f3ec", color: "#1d1b18" }}>
            <span className={`${face} relative`}>
              A<span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(false) }} />
            </span>
          </span>
          <span className="flex flex-1 items-center justify-start" style={{ background: "#151412", color: "#e9e3d6" }}>
            <span className={`${face} relative`}>
              a<span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(true) }} />
            </span>
          </span>
        </>
      ) : (
        <span className="flex flex-1 items-center justify-center" style={{ background: theme.bg, color: theme.fg }}>
          <span className={`${face} relative`}>
            Aa
            <span className="absolute -bottom-[5px] left-0 right-0 h-[2px] rounded-full" style={{ background: pen(theme.dark) }} />
          </span>
        </span>
      )}
    </span>
  );
}

/** The library's one setting: a painted cover for every text. Off by default, since each one is an image model call. */
function PaintedCovers() {
  const { paintedCovers } = useLibraryPrefs();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-rule pt-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
          <Paintbrush size={13} /> سىزىلغان مۇقاۋىلار
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-3">كۈتۈپخانىڭىزدىكى ھەر بىر تېكىستكە بىر رەسىم، ھەربىرى تەخمىنەن 2¢.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={paintedCovers}
        aria-label="سىزىلغان مۇقاۋىلار"
        onClick={() => setLibraryPrefs({ paintedCovers: !paintedCovers })}
        className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${paintedCovers ? "bg-[var(--rubric)]" : "bg-rule-strong"}`}
      >
        <span className={`absolute left-[3px] top-[3px] size-4 rounded-full bg-raised shadow transition-transform duration-200 ${paintedCovers ? "translate-x-4" : ""}`} />
      </button>
    </div>
  );
}

let swap: { finished: Promise<void> } | null = null;

/**
 * Type, colour and answers in one small panel. Every change applies to the
 * page underneath immediately, so the page itself is the preview.
 */
export function SettingsMenu({ compact = false }: { compact?: boolean }) {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const focusMode = useStore((s) => s.focusMode);
  const setUI = useStore((s) => s.setUI);
  const [tab, setTab] = useState<"look" | "text" | "answers">("look");

  const set = (patch: Partial<Settings>) => {
    setSettings(patch);
    applySettings({ ...useStore.getState().settings });
  };
  const size = (v: number) => set({ size: Math.max(15, Math.min(28, v)) });
  const dark = resolveTheme(settings.theme) === "night" || resolveTheme(settings.theme) === "ink";

  // A new theme is poured in as a circle that grows out of the swatch you picked.
  const pickTheme = (key: Settings["theme"], e: MouseEvent<HTMLButtonElement>) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void } };
    const quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || quiet || resolveTheme(key) === resolveTheme(settings.theme)) return set({ theme: key });
    // In percentages of the viewport, so the circle lands on the swatch at any zoom or pixel ratio.
    const r = e.currentTarget.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = r.left + r.width / 2;
    const y = r.top + 19;
    const at = `${((x / w) * 100).toFixed(2)}% ${((y / h) * 100).toFixed(2)}%`;
    const end = ((Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) / (Math.hypot(w, h) / Math.SQRT2)) * 100).toFixed(2);
    const root = document.documentElement;
    root.classList.add("theme-swap");
    // A new pick while one is pouring skips the old one; only the newest clears the flag.
    const vt = doc.startViewTransition(() => flushSync(() => set({ theme: key })));
    swap = vt;
    // While it pours, the browser sends every click to the root element instead of what is
    // under the pointer, so a quick second pick would be lost. Catch those clicks, end this
    // pour at once, and hand the click to the element underneath: a new pick pours in fresh.
    const passThrough = (ev: globalThis.MouseEvent) => {
      if (ev.target !== root) return;
      ev.stopPropagation();
      vt.skipTransition();
      const { clientX: x, clientY: y } = ev;
      vt.finished.finally(() => (document.elementFromPoint(x, y) as HTMLElement | null)?.click());
    };
    document.addEventListener("click", passThrough, true);
    vt.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0% at ${at})`, `circle(${end}% at ${at})`] },
          { duration: 620, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" }
        )
      )
      .catch(() => {});
    vt.finished.finally(() => {
      document.removeEventListener("click", passThrough, true);
      if (swap === vt) {
        swap = null;
        root.classList.remove("theme-swap");
      }
    });
  };

  return (
    <Popover label="كۆرۈنۈش ۋە جاۋابلار" tip="كۆرۈنۈش" width={compact ? 316 : 348} triggerClass={barBtn} trigger={<span className="block translate-y-[0.5px] font-serif text-[18px] leading-none">Aa</span>}>
      {() => (
        <div>
          {!compact && (
            <div className="mb-4">
              <Seg
                label="تەڭشەك بۆلىكى"
                value={tab}
                onChange={setTab}
                options={[
                  { key: "look", label: "كۆرۈنۈش" },
                  { key: "text", label: "تېكىست" },
                  { key: "answers", label: "جاۋابلار" },
                ]}
              />
            </div>
          )}

          {(compact || tab === "look") && (
            <div className="space-y-3.5">
              <div>
                <p className="mb-2.5 text-[12.5px] text-ink-3">ئۇسلۇب</p>
                <div className="grid grid-cols-6 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={(e) => pickTheme(t.key, e)}
                      aria-pressed={settings.theme === t.key}
                      data-tip={t.key === "auto" ? "سىستېمىڭىزغا ئەگىشىدۇ" : undefined}
                      className="group flex flex-col items-center gap-1.5 rounded-[12px] focus-visible:outline-offset-4"
                    >
                      <Swatch theme={t} on={settings.theme === t.key} />
                      <span className={`text-[11px] leading-none transition-colors ${settings.theme === t.key ? "font-medium text-ink" : "text-ink-3 group-hover:text-ink-2"}`}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Row label="قەلەم">
                <div className="flex items-center gap-2">
                  {PENS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set({ pen: p.key })}
                      aria-pressed={settings.pen === p.key}
                      aria-label={`${p.label} pen`}
                      data-tip={p.label}
                      className={`grid size-7 place-items-center rounded-full transition-[box-shadow,transform] active:scale-90 ${settings.pen === p.key ? "shadow-[0_0_0_2px_var(--bg-raised),0_0_0_3.5px_var(--ink-3)]" : ""}`}
                    >
                      <span className="size-5 rounded-full" style={{ background: dark ? p.dark : p.light }} />
                    </button>
                  ))}
                  <span className="ms-1 text-[12px] text-ink-3">{PENS.find((p) => p.key === settings.pen)?.label}</span>
                </div>
              </Row>

              {!compact && (
                <>
                  <Row label="بەلگىلىگۈچ">
                    <div className="flex items-center gap-2">
                      {MARKERS.map((m) => (
                        <button
                          key={m.key}
                          type="button"
                          onClick={() => set({ marker: m.key })}
                          aria-pressed={settings.marker === m.key}
                          aria-label={`${m.label} highlighter`}
                          data-tip={m.label}
                          className={`grid size-7 place-items-center rounded-full transition-[box-shadow,transform] active:scale-90 ${settings.marker === m.key ? "shadow-[0_0_0_2px_var(--bg-raised),0_0_0_3.5px_var(--ink-3)]" : ""}`}
                        >
                          <span className="h-3 w-5 -rotate-12 rounded-[3px] opacity-80" style={{ background: m.color }} />
                        </button>
                      ))}
                      <span className="ms-1 text-[12px] text-ink-3">{MARKERS.find((m) => m.key === settings.marker)?.label}</span>
                    </div>
                  </Row>
                  <div className="grid grid-cols-2 gap-1.5 border-t border-rule pt-3.5">
                    <Chip label="نومۇرلار" icon={<Pilcrow size={14} />} on={settings.numbers} onChange={(v) => set({ numbers: v })} />
                    <Chip label="خەرىتە" icon={<MapIcon size={14} />} on={settings.rail} onChange={(v) => set({ rail: v })} />
                    <Chip label="دىققەت" icon={<Focus size={14} />} on={focusMode} onChange={(v) => setUI({ focusMode: v })} />
                    <Chip label="ئاڭلاش" icon={<Headphones size={14} />} on={settings.listen} onChange={(v) => set({ listen: v })} />
                  </div>
                </>
              )}
              <PaintedCovers />
            </div>
          )}

          {!compact && tab === "text" && (
            <div className="space-y-3.5">
              <div>
                <p className="mb-2.5 text-[12.5px] text-ink-3">خەت نۇسخىسى</p>
                <div className="grid grid-cols-4 gap-2">
                  {FACES.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => set({ face: f.key })}
                      aria-pressed={settings.face === f.key}
                      className={`group flex h-[62px] flex-col items-center justify-center gap-1 rounded-[12px] border transition-[border-color,background-color,transform] active:scale-[0.97] ${
                        settings.face === f.key ? "border-ink bg-bg" : "border-rule hover:border-rule-strong"
                      }`}
                    >
                      <span className="text-[22px] leading-none text-ink" style={{ fontFamily: f.css }}>
                        Ag
                      </span>
                      <span className={`text-[11px] leading-none ${settings.face === f.key ? "font-medium text-ink" : "text-ink-3"}`}>{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <Row label="چوڭلۇقى">
                <div className="flex items-center gap-1.5">
                  <button type="button" aria-label="كىچىكرەك خەت" data-tip="كىچىكرەك" onClick={() => size(settings.size - 1)} className="grid size-7 place-items-center rounded-lg text-ink-2 transition-transform hover:bg-sunk active:scale-90">
                    <Minus size={14} />
                  </button>
                  <input
                    type="range"
                    min={15}
                    max={28}
                    value={settings.size}
                    onChange={(e) => size(Number(e.target.value))}
                    aria-label="خەت چوڭلۇقى"
                    className="h-1 min-w-0 flex-1 accent-[var(--rubric)]"
                  />
                  <button type="button" aria-label="چوڭراق خەت" data-tip="چوڭراق" onClick={() => size(settings.size + 1)} className="grid size-7 place-items-center rounded-lg text-ink-2 transition-transform hover:bg-sunk active:scale-90">
                    <Plus size={14} />
                  </button>
                  <span className="w-6 text-end text-[12px] tabular-nums text-ink-3">{settings.size}</span>
                </div>
              </Row>
              <Row label="ئارىلىق">
                <Seg
                  label="قۇر ئارىلىقى"
                  value={settings.leading}
                  onChange={(v) => set({ leading: v })}
                  options={[
                    { key: "tight", label: "زىچ" },
                    { key: "normal", label: "ئوتتۇرا" },
                    { key: "loose", label: "كەڭ" },
                  ]}
                />
              </Row>
              <Row label="كەڭلىكى">
                <Seg
                  label="ئىستون كەڭلىكى"
                  value={settings.width}
                  onChange={(v) => set({ width: v })}
                  options={[
                    { key: "narrow", label: "تار" },
                    { key: "normal", label: "ئوتتۇرا" },
                    { key: "wide", label: "كەڭ" },
                  ]}
                />
              </Row>
              <Row label="توغرىلاش">
                <Seg
                  label="تېكىست توغرىلىنىشى"
                  value={settings.align}
                  onChange={(v) => set({ align: v })}
                  options={[
                    { key: "left", label: <><AlignLeft size={13} /> باشتىن</> },
                    { key: "justify", label: <><AlignJustify size={13} /> ئىككى چەتكە</> },
                  ]}
                />
              </Row>
              <Row label="ئابزاسلار">
                <Seg
                  label="ئابزاس ئۇسلۇبى"
                  value={settings.paras}
                  onChange={(v) => set({ paras: v })}
                  options={[
                    { key: "spaced", label: "ئارىلىقلىق" },
                    { key: "indented", label: "كىرگۈزۈلگەن" },
                  ]}
                />
              </Row>
              {(["face", "size", "leading", "width", "align", "paras"] as const).some((k) => settings[k] !== DEFAULT_SETTINGS[k]) && (
                <button
                  type="button"
                  onClick={() =>
                    set({
                      face: DEFAULT_SETTINGS.face,
                      size: DEFAULT_SETTINGS.size,
                      leading: DEFAULT_SETTINGS.leading,
                      width: DEFAULT_SETTINGS.width,
                      align: DEFAULT_SETTINGS.align,
                      paras: DEFAULT_SETTINGS.paras,
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink"
                >
                  <RotateCcw size={12} /> تېكىست تەڭشەكلىرىنى ئەسلىگە قايتۇرۇش
                </button>
              )}
            </div>
          )}

          {!compact && tab === "answers" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-[12.5px] text-ink-3">جاۋاب ئۇزۇنلۇقى</p>
                <Seg
                  label="جاۋاب ئۇزۇنلۇقى"
                  value={settings.length}
                  onChange={(v) => set({ length: v })}
                  options={[
                    { key: "short", label: "قىسقا" },
                    { key: "normal", label: "تەڭپۇڭ" },
                    { key: "long", label: "تەپسىلىي" },
                  ]}
                />
                <p className="mt-2 text-[12px] leading-snug text-ink-4">
                  {settings.length === "short" ? "بىر-ئۈچ جۈملە." : settings.length === "long" ? "نازۇكلۇققا ئورۇن، بىر-ئىككى قىسقا ئابزاسقىچە." : "تەخمىنەن بىر ئابزاس."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
