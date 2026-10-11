"use client";

import { useEffect, useMemo, useState } from "react";
import { monthName, monthOf, price, type EditionOrder } from "@/lib/edition";
import { fetchOrders, keptCover } from "@/lib/editions";
import { TOPIC, topicArtSrc, topicOf, type TopicKey } from "@/lib/library";
import { useStore } from "@/lib/store";

/** Printed editions are on wherever they're being built, and in production once NEXT_PUBLIC_EDITIONS=1. */
export const EDITIONS_ON = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EDITIONS === "1";

const STATUS: Partial<Record<EditionOrder["status"], string>> = {
  paid: "paid, being set in type",
  setting: "being set in type",
  sent: "with the printer",
  printing: "being printed",
  shipped: "on its way to you",
  delivered: "delivered",
};

/** The month with enough in it for an edition: this one, or the last that had three things saved. */
export function editionMonth(items: { addedAt: number; origin?: string }[]): string {
  const now = monthOf(Date.now());
  const n = new Map<string, number>();
  for (const x of items) if (x.origin !== "sample") n.set(monthOf(x.addedAt), (n.get(monthOf(x.addedAt)) ?? 0) + 1);
  if ((n.get(now) ?? 0) >= 3) return now;
  return [...n.entries()].filter(([, c]) => c >= 3).map(([m]) => m).sort().reverse()[0] ?? now;
}

/**
 * Beside "Add articles": this month as a small printed book, its painted cover
 * on the front when one has been painted, and where the last order is.
 */
export function EditionCard({ onOpen }: { onOpen: (month: string, order?: string) => void }) {
  const library = useStore((s) => s.library);
  const month = useMemo(() => editionMonth(library), [library]);
  const items = useMemo(() => library.filter((x) => x.origin !== "sample" && monthOf(x.addedAt) === month), [library, month]);
  const topic = useMemo<TopicKey>(() => {
    const n = new Map<TopicKey, number>();
    for (const x of items) if (topicOf(x.topic) !== "unsorted") n.set(topicOf(x.topic), (n.get(topicOf(x.topic)) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "living";
  }, [items]);
  const [art, setArt] = useState<string | null>(null);
  const [order, setOrder] = useState<EditionOrder | null>(null);

  useEffect(() => {
    let live = true;
    void keptCover(month).then((c) => live && setArt(c?.art ? `data:image/jpeg;base64,${c.art}` : null));
    void fetchOrders().then((os) => live && setOrder(os.find((o) => o.month === month && STATUS[o.status]) ?? null));
    return () => {
      live = false;
    };
  }, [month]);

  const when = monthName(month, { year: false });
  return (
    <button type="button" className="lib-edition" onClick={() => onOpen(month, order?.id)} style={{ ["--c" as string]: TOPIC[topic].shades[2] }}>
      <span className="lib-edition-book" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art ?? topicArtSrc(topic)} alt="" />
        <span className="lib-edition-mast">Gloss</span>
      </span>
      <span className="min-w-0 text-left">
        <span className="lib-add-title">Your {when} edition</span>
        <span className="lib-add-sub">
          {order
            ? `${order.test ? "Test order, " : ""}${STATUS[order.status]}`
            : items.length
              ? `${items.length} ${items.length === 1 ? "piece" : "pieces"} as a printed book, ${price()} posted`
              : "What you save this month, as a printed book"}
        </span>
      </span>
    </button>
  );
}
