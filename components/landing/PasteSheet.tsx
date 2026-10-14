"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

export function PasteSheet({ open, onClose, onRead }: { open: boolean; onClose: () => void; onRead: (text: string) => void }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/25 p-4 backdrop-blur-[3px]" onClick={onClose} style={{ animation: "fade 0.2s" }}>
      <div role="dialog" aria-label="ئوقۇش ئۈچۈن تېكىست چاپلاڭ" className="pop w-full max-w-[640px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-[24px] leading-none text-ink">ئوقۇيدىغان بىرەر نەرسە چاپلاڭ</h2>
          <button type="button" aria-label="تاقاش" data-tip="تاقاش" data-tip-kbd="Esc" onClick={onClose} className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-sunk hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          placeholder="ماقالە، باب ياكى خاتىرىلىرىڭىز. قىسقا بىرىنچى قۇر ماۋزۇ بولىدۇ."
          aria-label="ئوقۇيدىغان تېكىست"
          className="scroll-thin w-full resize-none rounded-[12px] border border-rule bg-bg p-3.5 font-serif text-[16.5px] leading-[1.6] text-ink outline-none placeholder:text-ink-4 focus:border-rule-strong focus-visible:outline-none"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-[12.5px] tabular-nums text-ink-3">{words ? `${words.toLocaleString()} words` : ""}</span>
          <button
            type="button"
            disabled={words < 20}
            onClick={() => onRead(text)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-bg disabled:opacity-30"
          >
            بۇنى ئوقۇش <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
