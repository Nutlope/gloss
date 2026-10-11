/**
 * Lulu's Print API: it prints a book from two PDFs and posts it. OAuth client
 * credentials, a token kept until it lapses, and the four calls an edition
 * needs: the size of the cover, a print job, its status, and the signature
 * on its webhooks. The sandbox (LULU_SANDBOX=1) never prints anything.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { PRINT, spineInches } from "./edition";

const BASE = () => (process.env.LULU_SANDBOX === "1" ? "https://api.sandbox.lulu.com" : "https://api.lulu.com");

export const luluReady = () => Boolean(process.env.LULU_CLIENT_KEY && process.env.LULU_CLIENT_SECRET);

const POD = () => process.env.LULU_POD_PACKAGE || PRINT.pod;

let token: { value: string; until: number } | null = null;

async function auth(): Promise<string> {
  if (token && token.until > Date.now()) return token.value;
  const basic = Buffer.from(`${process.env.LULU_CLIENT_KEY}:${process.env.LULU_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE()}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
    body: "grant_type=client_credentials",
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !j.access_token) throw new Error(`Lulu would not sign us in (${res.status}).`);
  token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 300) - 60) * 1000 };
  return token.value;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE()}${path}`, {
    method,
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await auth()}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Lulu answered ${res.status} to ${path}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T;
}

/** The whole cover sheet in inches: Lulu's own figure when we can ask, its formula when we can't. */
export async function coverSize(pages: number): Promise<{ width: number; height: number }> {
  if (luluReady()) {
    try {
      const d = await call<{ width: string; height: string; unit: string }>("POST", "/cover-dimensions/", { pod_package_id: POD(), interior_page_count: pages, unit: "pt" });
      const w = Number(d.width) / 72, h = Number(d.height) / 72;
      if (w > 0 && h > 0) return { width: w, height: h };
    } catch {}
  }
  const b = PRINT.bleed;
  return { width: Math.round((2 * (PRINT.trim.w + b) + spineInches(pages)) * 72) / 72, height: PRINT.trim.h + 2 * b };
}

export type ShipTo = { name: string; line1: string; line2?: string; city: string; state: string; postcode: string; country: string; phone: string; email?: string };

/** Lulu keeps an address line to 30 characters: a long first line spills into the second. */
function fit(a: ShipTo) {
  let street1 = a.line1.trim(), street2 = (a.line2 ?? "").trim();
  if (street1.length > 30) {
    const cut = street1.slice(0, 31).lastIndexOf(" ");
    const head = street1.slice(0, cut > 10 ? cut : 30).trim();
    street2 = `${street1.slice(head.length).trim()} ${street2}`.trim();
    street1 = head;
  }
  return {
    name: a.name.trim().slice(0, 35),
    street1,
    street2: street2.slice(0, 30) || undefined,
    city: a.city.trim().slice(0, 30),
    state_code: a.state.trim(),
    postcode: a.postcode.trim(),
    country_code: a.country.trim().toUpperCase(),
    phone_number: a.phone.trim().slice(0, 20),
    email: a.email,
  };
}

export type LuluJob = {
  id: number;
  status: { name: string; message?: string; line_item_statuses?: { name: string; messages?: { tracking_id?: string; tracking_urls?: string[]; carrier_name?: string } }[] };
  line_items?: { tracking_id?: string; tracking_urls?: string[]; status?: { name: string; messages?: Record<string, unknown> } }[];
  estimated_shipping_dates?: { arrival_min?: string; arrival_max?: string; dispatch_min?: string; dispatch_max?: string };
};

export async function createJob(o: { id: string; title: string; interior: string; cover: string; ship: ShipTo; email: string }): Promise<LuluJob> {
  return call<LuluJob>("POST", "/print-jobs/", {
    contact_email: process.env.LULU_CONTACT_EMAIL || o.email,
    external_id: o.id,
    line_items: [
      {
        external_id: o.id,
        title: o.title.slice(0, 255),
        quantity: 1,
        printable_normalization: { pod_package_id: POD(), interior: { source_url: o.interior }, cover: { source_url: o.cover } },
      },
    ],
    // The shortest wait Lulu allows: an hour in which a job can still be cancelled.
    production_delay: 60,
    shipping_level: process.env.LULU_SHIPPING_LEVEL || PRINT.shipping,
    shipping_address: fit({ ...o.ship, email: o.ship.email ?? o.email }),
  });
}

export const getJob = (id: string) => call<LuluJob>("GET", `/print-jobs/${encodeURIComponent(id)}/`);

/** Where a Lulu status leaves an edition. */
export function statusFromLulu(name: string): "sent" | "printing" | "shipped" | "delivered" | "failed" | "canceled" {
  switch (name) {
    case "IN_PRODUCTION":
      return "printing";
    case "SHIPPED":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "REJECTED":
    case "ERROR":
      return "failed";
    case "CANCELED":
      return "canceled";
    default:
      return "sent";
  }
}

export function trackingOf(job: LuluJob): { url?: string; carrier?: string; id?: string } | null {
  const s = job.status.line_item_statuses?.find((x) => x.messages?.tracking_urls?.length || x.messages?.tracking_id)?.messages;
  const li = job.line_items?.find((x) => x.tracking_urls?.length || x.tracking_id);
  const url = s?.tracking_urls?.[0] ?? li?.tracking_urls?.[0];
  const id = s?.tracking_id ?? li?.tracking_id;
  return url || id ? { url, id, carrier: s?.carrier_name } : null;
}

/** Lulu signs each webhook with the API secret: HMAC-SHA256 of the raw body, in the Lulu-HMAC-SHA256 header. */
export function verifyLulu(raw: string, header: string | null): boolean {
  const secret = process.env.LULU_CLIENT_SECRET;
  if (!secret || !header) return false;
  const mac = createHmac("sha256", secret).update(raw, "utf8").digest();
  const given = header.trim();
  for (const expected of [mac.toString("hex"), mac.toString("base64")]) {
    const a = Buffer.from(expected), b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}
