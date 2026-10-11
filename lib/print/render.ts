/**
 * HTML to print-ready PDF. With a DocRaptor key, Prince sets it: the best
 * paged-media engine there is, at about 12¢ a document. Without one, headless
 * Chrome does, with Paged.js laying out the pages: free, and close. Locally
 * that is the Chrome on this machine; on Vercel, a serverless Chromium.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "puppeteer-core";

export type Engine = "prince" | "chrome";
export type Rendered = { pdf: Uint8Array; pages: number };

export const engine = (): Engine => (process.env.DOCRAPTOR_API_KEY ? "prince" : "chrome");

/** A press for one book: renders as many documents as it needs, then closes. */
export type Session = { render: (html: string, opts: { paged: boolean; title: string }) => Promise<Rendered>; close: () => Promise<void> };

export async function openPress(): Promise<Session> {
  if (engine() === "prince") return { render: docraptor, close: async () => {} };
  const browser = await launch();
  return {
    render: (html, opts) => chrome(browser, html, opts),
    close: () => browser.close().catch(() => {}),
  };
}

/* ---------- DocRaptor (Prince) ---------- */

async function docraptor(html: string, opts: { paged: boolean; title: string }): Promise<Rendered> {
  const key = process.env.DOCRAPTOR_API_KEY!;
  const res = await fetch("https://api.docraptor.com/docs", {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}` },
    body: JSON.stringify({
      type: "pdf",
      document_content: html,
      // Test documents are free and watermarked: anything that is not the live site.
      test: process.env.DOCRAPTOR_TEST === "1" || process.env.VERCEL_ENV !== "production",
      javascript: false,
      prince_options: { media: "print", pdf_title: opts.title },
    }),
  });
  if (!res.ok) throw new Error(`DocRaptor answered ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const pdf = new Uint8Array(await res.arrayBuffer());
  const pages = Number(res.headers.get("x-docraptor-num-pages")) || countPages(pdf);
  return { pdf, pages };
}

/** Pages in a PDF, from its page objects, for when no one says. */
function countPages(pdf: Uint8Array): number {
  const s = Buffer.from(pdf).toString("latin1");
  return (s.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
}

/* ---------- Chrome with Paged.js ---------- */

const LOCAL_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function launch(): Promise<Browser> {
  const puppeteer = await import("puppeteer-core");
  const own = process.env.CHROME_PATH;
  if (!own && process.platform === "linux" && (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  const { existsSync } = await import("node:fs");
  const executablePath = own ?? LOCAL_CHROME.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome to print with. Install Chrome, set CHROME_PATH, or set DOCRAPTOR_API_KEY.");
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check", "--font-render-hinting=none"] });
}

let polyfill: Promise<string> | null = null;
const pagedJs = () => (polyfill ??= readFile(path.join(process.cwd(), "node_modules/pagedjs/dist/paged.polyfill.min.js"), "utf8"));

async function chrome(browser: Browser, html: string, opts: { paged: boolean; title: string }): Promise<Rendered> {
  const page = await browser.newPage();
  try {
    let doc = html;
    if (opts.paged) {
      // Paged.js lays the book out once the faces have loaded, then says how many pages it made.
      const boot = `<script>window.PagedConfig={auto:true,before:function(){return document.fonts.ready},after:function(){window.__pages=document.querySelectorAll(".pagedjs_page").length}};</script><script>${await pagedJs()}</script>`;
      // A function, so the polyfill's own "$&" and "$'" are not read as replacement patterns.
      doc = html.replace("</body>", () => `${boot}</body>`);
    }
    await page.setContent(doc, { waitUntil: "load", timeout: 120_000 });
    let pages = 1;
    if (opts.paged) {
      await page.waitForFunction("window.__pages > 0", { timeout: 240_000, polling: 250 });
      pages = Number(await page.evaluate("window.__pages"));
    } else {
      await page.evaluate("document.fonts.ready.then(() => true)");
    }
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, timeout: 240_000, tagged: false, outline: false });
    return { pdf: new Uint8Array(pdf), pages };
  } finally {
    await page.close().catch(() => {});
  }
}
