"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { Lockup } from "@/components/brand/Gloss";
import { editionTitle, monthName, price, PRINT, type CoverCopy, type EditionOrder } from "@/lib/edition";
import { fetchOrder } from "@/lib/editions";
import { TOPIC, topicArtSrc } from "@/lib/library";
import { COVER_CSS, frontHTML } from "@/lib/print/html";

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

type Fields = { email: string; name: string; line1: string; line2: string; city: string; state: string; postcode: string; phone: string };

/**
 * A stand-in for Stripe's hosted checkout, so the whole order can be tried on
 * a local run: the same fields Stripe collects, and no card. The order goes to
 * press as a test, and never to a printer.
 */
export function TestCheckout() {
  const [id, setId] = useState<string | null>(null);
  const [info, setInfo] = useState<{ order: EditionOrder; art: boolean; copy?: CoverCopy } | null>(null);
  const [f, setF] = useState<Fields>({ email: "", name: "", line1: "", line2: "", city: "", state: "", postcode: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("edition");
    setId(e);
    if (e) void fetchOrder(e).then(setInfo);
  }, []);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/editions/${encodeURIComponent(id)}/test-pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? "That did not go through.");
      return;
    }
    window.location.href = `/library?edition=${encodeURIComponent(id)}`;
  };

  const o = info?.order;
  const topic = info?.copy?.topic ?? "living";
  const view = o && { name: o.name, month: o.month, theme: info?.copy?.theme ?? "", lines: info?.copy?.lines ?? [], topic, art: info?.art ? `/api/editions/${o.id}/art` : null, count: o.texts };

  return (
    <div className="tc">
      <style dangerouslySetInnerHTML={{ __html: COVER_CSS }} />
      <header className="tc-top">
        <Lockup />
        <span className="tc-badge">Test checkout</span>
      </header>
      <p className="tc-banner">No card is charged and nothing is printed. With Stripe set up (STRIPE_SECRET_KEY), Stripe&rsquo;s own checkout takes this step.</p>
      <main className="tc-main">
        <section className="tc-summary">
          {view ? (
            <>
              <div className="tc-book" style={{ ["--c" as string]: TOPIC[topic].shades[2] }}>
                <div className="tc-front" dangerouslySetInnerHTML={{ __html: frontHTML(view, { plate: topicArtSrc(topic) }) }} />
              </div>
              <div>
                <p className="tc-name">Gloss, {editionTitle(o!.name)}</p>
                <p className="tc-sub">
                  {monthName(o!.month)} · {o!.texts} {o!.texts === 1 ? "piece" : "pieces"} with your highlights
                </p>
                <dl className="tc-lines">
                  <div>
                    <dt>6 × 9 inch paperback, full colour</dt>
                    <dd>{price()}</dd>
                  </div>
                  <div>
                    <dt>Shipping, tracked, US</dt>
                    <dd>Included</dd>
                  </div>
                  <div className="is-total">
                    <dt>Total</dt>
                    <dd>{price()}</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <p className="ed-empty">
              <Loader2 size={15} className="animate-spin" /> Finding your edition
            </p>
          )}
        </section>
        <form className="tc-form" onSubmit={pay}>
          <p className="tc-h">Contact</p>
          <input className="tc-in" type="email" required placeholder="Email" autoComplete="email" value={f.email} onChange={set("email")} />
          <p className="tc-h">Shipping address</p>
          <input className="tc-in" required placeholder="Full name" autoComplete="name" value={f.name} onChange={set("name")} />
          <input className="tc-in" required placeholder="Address" autoComplete="address-line1" value={f.line1} onChange={set("line1")} />
          <input className="tc-in" placeholder="Apartment, suite (optional)" autoComplete="address-line2" value={f.line2} onChange={set("line2")} />
          <div className="tc-row">
            <input className="tc-in" required placeholder="City" autoComplete="address-level2" value={f.city} onChange={set("city")} />
            <select className="tc-in" required value={f.state} onChange={set("state")} autoComplete="address-level1">
              <option value="">State</option>
              {STATES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <input className="tc-in" required placeholder="ZIP" inputMode="numeric" autoComplete="postal-code" value={f.postcode} onChange={set("postcode")} />
          </div>
          <input className="tc-in" required placeholder="Phone, for the carrier" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} />
          <p className="tc-h">Payment</p>
          <div className="tc-card">
            <Lock size={14} /> Test mode: no card needed
          </div>
          {error && <p className="ed-warn">{error}</p>}
          <button type="submit" className="ed-print tc-pay" disabled={busy || !o || o.status !== "draft"}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Paying
              </>
            ) : (
              <>
                Pay {price(PRINT.priceCents)} <ArrowRight size={16} />
              </>
            )}
          </button>
          <p className="ed-fine">Printed on demand by Lulu and posted to you. It arrives {PRINT.arrives}.</p>
        </form>
      </main>
    </div>
  );
}
