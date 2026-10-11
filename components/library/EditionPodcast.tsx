"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Download, Headphones, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { openKeyMenu } from "@/lib/ask";
import { monthName, type PrintText } from "@/lib/edition";
import { keptPodcast, makePodcast, type KeptPodcast, type PodProgress } from "@/lib/editions";
import { TOPIC } from "@/lib/library";
import { clock, podMinutes, type PodScript } from "@/lib/podcast";

const RATES = [1, 1.25, 1.5, 0.85];
const BARS = 64;

/** The ink a chapter is drawn in: its first piece's subject, or the pencil grey of the opening and the close. */
function inkOf(script: PodScript, seg: number, texts: PrintText[]): string {
  const n = script.segments[seg]?.pieces[0];
  const t = n ? texts[n - 1] : undefined;
  return t ? TOPIC[t.topic].shades[2] : "var(--ink-3)";
}

/** The line being said at `t`, by binary search over where each one starts. */
function lineAt(starts: number[], t: number): number {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The month as a podcast, beside the book: two hosts talk the pieces through,
 * with the reader's highlights and notes. Made once, kept on this device, and
 * played here with the chapters drawn in each piece's ink. While it plays,
 * the book turns to the piece being talked about.
 */
export function EditionPodcast({
  month,
  name,
  texts,
  order,
  art,
  onChapter,
  fixed = false,
}: {
  month: string;
  name: string;
  /** The book's pieces in the book's order; null while they are gathered. */
  texts: PrintText[] | null;
  /** A printed edition of this month, which pays for the podcast. */
  order?: string;
  /** The cover, for the phone's lock screen. */
  art?: string | null;
  onChapter?: (pieces: number[]) => void;
  /** The book is printed and can no longer change: never call the episode out of date. */
  fixed?: boolean;
}) {
  const [pod, setPod] = useState<KeptPodcast | null | undefined>(undefined);
  const [making, setMaking] = useState<PodProgress | null>(null);
  const [error, setError] = useState<{ text: string; needKey?: boolean } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const [url, setUrl] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = useRef<AbortController | null>(null);
  const seg = useRef(-1);

  useEffect(() => {
    let live = true;
    void keptPodcast(month).then((p) => live && setPod(p));
    return () => {
      live = false;
      stop.current?.abort();
    };
  }, [month]);

  // One audio element for the episode kept here, its time followed every frame while it plays.
  useEffect(() => {
    if (!pod) return;
    const url = URL.createObjectURL(pod.audio);
    setUrl(url);
    const a = new Audio(url);
    a.preload = "auto";
    audio.current = a;
    let raf = 0;
    const tick = () => {
      setT(a.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPlaying(true);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      setT(a.currentTime);
    };
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("seeked", () => setT(a.currentTime));
    return () => {
      cancelAnimationFrame(raf);
      a.pause();
      a.removeAttribute("src");
      audio.current = null;
      URL.revokeObjectURL(url);
      setUrl(null);
      setPlaying(false);
      setT(0);
    };
  }, [pod]);

  const at = pod ? lineAt(pod.starts, t) : 0;
  const line = pod?.script.lines[at];

  // A new chapter: the book turns to the piece being talked about.
  useEffect(() => {
    if (!pod || !line || !playing || line.seg === seg.current) return;
    seg.current = line.seg;
    const pieces = pod.script.segments[line.seg]?.pieces ?? [];
    if (pieces.length) onChapter?.(pieces);
  }, [pod, line, playing, onChapter]);

  const make = useCallback(async () => {
    if (!texts?.length) return;
    audio.current?.pause();
    stop.current?.abort();
    const ctrl = (stop.current = new AbortController());
    setError(null);
    const r = await makePodcast({ month, name, texts, order }, setMaking, ctrl.signal);
    if (ctrl.signal.aborted) return;
    setMaking(null);
    if (r.ok) {
      seg.current = -1;
      setPod(r.podcast);
    } else setError({ text: r.error, needKey: r.needKey });
  }, [month, name, texts, order]);

  const toggle = () => {
    const a = audio.current;
    if (!a || !pod) return;
    if (!a.paused) return a.pause();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: pod.script.title,
        artist: `${pod.script.hosts.join(" and ")}, for ${name || "you"}`,
        album: `Gloss · ${monthName(month)}`,
        artwork: art ? [{ src: art, sizes: "1280x1920", type: "image/jpeg" }] : [],
      });
    }
    a.playbackRate = rate;
    void a.play();
  };

  const seekFrom = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !pod) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.min(pod.seconds - 0.05, Math.max(0, ((e.clientX - r.left) / r.width) * pod.seconds));
    setT(a.currentTime);
  };

  const nextRate = () => {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(r);
    if (audio.current) audio.current.playbackRate = r;
  };

  /** The waveform: loudness where it was measured, each bar in the ink of the chapter it falls in. */
  const bars = useMemo(() => {
    if (!pod || !texts) return [];
    return Array.from({ length: BARS }, (_, k) => {
      const mid = ((k + 0.5) / BARS) * pod.seconds;
      const peak = pod.peaks.length ? pod.peaks[Math.min(pod.peaks.length - 1, Math.floor((k / BARS) * pod.peaks.length))] : 0.35 + 0.5 * Math.abs(Math.sin(k * 2.7));
      return { h: Math.max(0.1, peak), ink: inkOf(pod.script, pod.script.lines[lineAt(pod.starts, mid)].seg, texts), at: mid };
    });
  }, [pod, texts]);

  const stale = !fixed && pod && texts && (pod.ids.length !== texts.length || pod.ids.some((id, i) => texts[i]?.id !== id));
  const minutes = podMinutes(texts?.length ?? 0);

  if (pod === undefined) return null;

  if (making)
    return (
      <section className="ed-pod is-making" aria-live="polite">
        <span className="ed-pod-btn is-busy" aria-hidden>
          <Loader2 size={18} className="animate-spin" />
        </span>
        <div className="min-w-0">
          <p className="ed-pod-title">{making.stage === "recording" ? making.script.title : "Writing the conversation"}</p>
          <p className="ed-pod-sub">
            {making.stage === "recording" ? `Recording ${making.script.hosts.join(" and ")}, ${making.done} of ${making.of} lines` : `From ${texts?.length ?? 0} pieces and every mark you made in them`}
          </p>
          <div className="ed-pod-progress">
            {making.stage === "recording" ? (
              making.script.lines.map((l, i) => <span key={i} style={{ background: inkOf(making.script, l.seg, texts ?? []), opacity: i < making.done ? 1 : 0.18 }} />)
            ) : (
              <span className="is-writing" />
            )}
          </div>
          <p className="ed-pod-fine">Keep this open while it records. It takes a minute or two.</p>
        </div>
      </section>
    );

  if (!pod)
    return (
      <section className="ed-pod is-empty">
        <span className="ed-pod-btn is-quiet" aria-hidden>
          <Headphones size={18} />
        </span>
        <div className="min-w-0">
          <p className="ed-pod-title">Hear it as a podcast</p>
          <p className="ed-pod-sub">
            Two hosts talk your {monthName(month, { year: false })} through, with your highlights and notes. About {minutes} minutes{order ? ", and it comes with your edition" : ""}.
          </p>
          {error && (
            <p className="ed-note">
              {error.text}{" "}
              {error.needKey && (
                <button type="button" className="ed-link is-inline" onClick={openKeyMenu}>
                  Add your key
                </button>
              )}
            </p>
          )}
          <button type="button" className="ed-pod-make" disabled={!texts?.length} onClick={() => void make()}>
            <Play size={13} fill="currentColor" /> Make the episode
          </button>
        </div>
      </section>
    );

  const total = pod.seconds;
  const segment = line ? pod.script.segments[line.seg] : undefined;
  return (
    <section className="ed-pod is-ready" data-playing={playing || undefined}>
      <div className="ed-pod-top">
        <button type="button" className="ed-pod-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="translate-x-[1px]" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="ed-pod-title">{pod.script.title}</p>
          <p className="ed-pod-sub">
            With {pod.script.hosts.join(" and ")} · {Math.max(1, Math.round(total / 60))} min
          </p>
        </div>
        <div className="ed-pod-tools">
          <button type="button" className="ed-pod-tool is-rate" onClick={nextRate} data-tip="Speed">
            {rate}×
          </button>
          <a className="ed-pod-tool" href={url ?? undefined} download={`Gloss, ${monthName(month)}.mp3`} data-tip="Download the MP3" aria-label="Download the MP3">
            <Download size={14} />
          </a>
          <button type="button" className="ed-pod-tool" onClick={() => void make()} data-tip="Make it again" aria-label="Make it again">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div
        className="ed-pod-wave"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(t)}
        aria-valuetext={`${clock(t)} of ${clock(total)}`}
        tabIndex={0}
        onKeyDown={(e) => {
          const a = audio.current;
          if (!a) return;
          if (e.key === "ArrowRight") a.currentTime = Math.min(total, a.currentTime + 10);
          else if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 10);
          else if (e.key === " " || e.key === "Enter") toggle();
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFrom(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && seekFrom(e)}
      >
        {bars.map((b, k) => (
          <span key={k} data-done={b.at <= t || undefined} style={{ height: `${Math.round(b.h * 100)}%`, background: b.ink }} />
        ))}
        <i className="ed-pod-head" style={{ left: `${(t / total) * 100}%` }} />
      </div>

      <div className="ed-pod-meta">
        <span className="ed-pod-time">
          {clock(t)} <span>/ {clock(total)}</span>
        </span>
        {segment && <span className="ed-pod-chapter">{segment.title}</span>}
      </div>

      {line && (t > 0 || playing) && (
        <p className="ed-pod-line" key={at}>
          <b>{pod.script.hosts[line.who]}</b> {line.say}
        </p>
      )}

      {stale && (
        <p className="ed-note">
          Made before you changed what&rsquo;s inside.{" "}
          <button type="button" className="ed-link is-inline" onClick={() => void make()}>
            Make it again
          </button>
        </p>
      )}
      {error && <p className="ed-note">{error.text}</p>}
    </section>
  );
}
