import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

// lib/ imports each other without extensions, which the app's bundler is fine
// with and Node's ESM loader is not. Point "./article" at "./article.ts" when
// that file exists, then import the module under test after the hook is live.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
      const url = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
    return next(specifier, context);
  },
});
const { epubToArticle, EpubError, EPUB_MAX_BYTES } = await import("../lib/epub.ts");

// linkedom stands in for the browser's DOMParser. Both return a Document; the parser only wants its root element.
const parse = (markup, type) => new DOMParser().parseFromString(markup, type).documentElement;

// A small zip writer with real deflate, because lib/zip.ts only writes stored
// entries and most EPUB tools deflate everything but the cover. CRC is left at
// zero: our reader does not verify it, and neither do most. `stored` lets one
// test cover the other method.
function makeZip(files, { stored = false } = {}) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const raw = typeof content === "string" ? enc.encode(content) : content;
    const data = stored ? raw : new Uint8Array(deflateRawSync(raw));
    const method = stored ? 0 : 8;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const asFile = (bytes, name = "book.epub") => new File([bytes], name, { type: "application/epub+zip" });

const container = (opf) => `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="${opf}" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const chapter = (heading, paras) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>
${heading ? `<h1>${heading}</h1>` : ""}
${paras.map((p) => `<p>${p}</p>`).join("\n")}
<img src="../images/plate.jpg" alt="A plate"/>
</body></html>`;

const long = (seed) => Array.from({ length: 40 }, (_, i) => `${seed} word${i}`).join(" ") + ".";

/** EPUB 3: nav document, a cover kept out of the reading order, one chapter with a heading and one without. */
function epub3() {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="3.0" unique-identifier="id">
  <metadata>
    <dc:identifier id="id">urn:uuid:1</dc:identifier>
    <dc:title>The Long Walk Home</dc:title>
    <dc:creator>Ada Example</dc:creator>
    <dc:creator>Ben Example</dc:creator>
    <dc:date>2019-03-04T00:00:00Z</dc:date>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="c1" href="text/ch%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="images/plate.jpg" media-type="image/jpeg"/>
  </manifest>
  <spine>
    <itemref idref="cover" linear="no"/>
    <itemref idref="c1"/>
    <itemref idref="c2"/>
  </spine>
</package>`;
  return makeZip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": container("OEBPS/content.opf"),
    "OEBPS/content.opf": opf,
    "OEBPS/nav.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc" xmlns:epub="http://www.idpf.org/2007/ops"><ol>
      <li><a href="text/ch%201.xhtml">One: Setting Out</a></li>
      <li><a href="text/ch2.xhtml#start">Two: The River</a></li></ol></nav></body></html>`,
    "OEBPS/cover.xhtml": chapter(null, ["COVER IMAGE PLACEHOLDER TEXT THAT SHOULD NEVER BE READ " + long("cover")]),
    "OEBPS/text/ch 1.xhtml": chapter("One: Setting Out", [long("alpha"), long("beta")]),
    "OEBPS/text/ch2.xhtml": chapter(null, [long("gamma"), long("delta")]),
    "OEBPS/images/plate.jpg": new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]),
  });
}

test("an EPUB 3 reads in spine order, skips the non-linear cover, titles chapters from the nav and drops pictures", async () => {
  const a = await epubToArticle(asFile(epub3()), parse);
  assert.equal(a.title, "The Long Walk Home");
  assert.equal(a.author, "Ada Example, Ben Example");
  assert.equal(a.published, "2019-03-04");
  assert.equal(a.source, "book.epub");
  assert.equal(a.origin, "file");
  const texts = a.blocks.map((b) => b.runs.map((r) => r.text).join(""));
  assert.ok(!texts.some((t) => t.includes("COVER IMAGE")), "linear=no content must not be read");
  assert.equal(a.blocks[0].type, "h2");
  assert.equal(texts[0], "One: Setting Out");
  // Chapter two has no heading of its own, so the nav label stands in, found through the href's fragment and %20 encoding.
  const two = texts.indexOf("Two: The River");
  assert.ok(two > 0, "nav label inserted for a heading-less chapter");
  assert.equal(a.blocks[two].type, "h2");
  assert.ok(texts.indexOf("Two: The River") > texts.findIndex((t) => t.startsWith("alpha")), "chapters stay in spine order");
  assert.ok(!a.blocks.some((b) => b.type === "figure"), "images inside the zip are not surfaced as figures");
  assert.deepEqual(
    a.blocks.map((b) => b.id),
    a.blocks.map((_, i) => `b${i + 1}`),
    "block ids are one sequence across chapters"
  );
});

test("stored (uncompressed) entries read the same as deflated ones", async () => {
  const files = {
    "META-INF/container.xml": container("book.opf"),
    "book.opf": `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Stored</dc:title></metadata>
      <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>`,
    "a.xhtml": chapter("Only Chapter", [long("one"), long("two")]),
  };
  const stored = await epubToArticle(asFile(makeZip(files, { stored: true })), parse);
  const deflated = await epubToArticle(asFile(makeZip(files)), parse);
  assert.equal(stored.title, "Stored");
  assert.deepEqual(stored.blocks.map((b) => b.runs), deflated.blocks.map((b) => b.runs));
});

test("an EPUB 2 with an NCX and no nav still gets chapter titles, and a zip-slip entry name is ignored, not followed", async () => {
  const opf = `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <metadata><dc:title>Old Format</dc:title><dc:creator>Carol Example</dc:creator><dc:date>2008</dc:date></metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="c1" href="c1.html" media-type="application/xhtml+xml"/>
    <item id="c2" href="Tom%20%26%20Jerry.xhtml" media-type="application/xhtml+xml"/>
    <item id="evil" href="../../../etc/passwd.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/><itemref idref="evil"/></spine>
</package>`;
  const bytes = makeZip({
    "META-INF/container.xml": container("OPS/book.opf"),
    "OPS/book.opf": opf,
    "OPS/toc.ncx": `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
      <navPoint id="n1"><navLabel><text>Chapter the First</text></navLabel><content src="c1.html"/></navPoint></navMap></ncx>`,
    // Sloppy but common: an HTML chapter that is not well-formed XML (unclosed <br>, bare &). It must fall back to HTML parsing.
    "OPS/c1.html": `<html><body><p>${long("first")}<br>${long("second")} Fish & chips.</p><p>${long("third")}</p></body></html>`,
    // The manifest spells this one with %20 and %26; decodeURI would leave the %26 and lose the chapter.
    "OPS/Tom & Jerry.xhtml": chapter("Tom and Jerry", [long("cartoon")]),
    "../../../etc/passwd.xhtml": chapter("Should Not Appear", [long("evil")]),
  });
  // linkedom forgives bad XML where every browser's DOMParser returns a <parsererror> tree.
  // Stand in for the browser on that one chapter so the HTML fallback is what gets exercised.
  const strict = (markup, type) => (type !== "text/html" && markup.includes("Fish & chips") ? parse("<parsererror>not well-formed</parsererror>", "text/xml") : parse(markup, type));
  const a = await epubToArticle(asFile(bytes, "old-format.epub"), strict);
  assert.equal(a.title, "Old Format");
  assert.equal(a.author, "Carol Example");
  assert.equal(a.published, "2008");
  const texts = a.blocks.map((b) => b.runs.map((r) => r.text).join(""));
  assert.equal(texts[0], "Chapter the First");
  assert.ok(texts.some((t) => t.includes("Fish & chips")), "a non-XML chapter is still read as HTML");
  assert.ok(texts.includes("Tom and Jerry"), "a percent-encoded href with a reserved character resolves to its entry");
  assert.ok(!texts.some((t) => t.includes("Should Not Appear") || t.includes("evil")), "a path that climbs out of the archive is never resolved");
});

test("what is not an EPUB says so in a sentence the landing page can show", async () => {
  await assert.rejects(epubToArticle(asFile(new TextEncoder().encode("not a zip at all")), parse), (e) => e instanceof EpubError && /not an EPUB/.test(e.message));
  const noContainer = makeZip({ "mimetype": "application/epub+zip", "x.xhtml": chapter("X", [long("x")]) });
  await assert.rejects(epubToArticle(asFile(noContainer), parse), (e) => e instanceof EpubError && /container\.xml/.test(e.message));
  const noSpine = makeZip({
    "META-INF/container.xml": container("b.opf"),
    "b.opf": `<package xmlns="http://www.idpf.org/2007/opf"><manifest/><spine/></package>`,
  });
  await assert.rejects(epubToArticle(asFile(noSpine), parse), (e) => e instanceof EpubError && /no chapters/.test(e.message));
  const pictureBook = makeZip({
    "META-INF/container.xml": container("b.opf"),
    "b.opf": `<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>`,
    "a.xhtml": `<html><body><img src="p1.jpg"/><img src="p2.jpg"/></body></html>`,
  });
  await assert.rejects(epubToArticle(asFile(pictureBook), parse), (e) => e instanceof EpubError && /no readable text/.test(e.message));
});

test("an oversized file is refused before any byte is read", async () => {
  let read = false;
  const huge = { name: "huge.epub", size: EPUB_MAX_BYTES + 1, arrayBuffer: async () => ((read = true), new ArrayBuffer(0)) };
  await assert.rejects(epubToArticle(huge, parse), (e) => e instanceof EpubError && /too large/.test(e.message));
  assert.equal(read, false);
});

test("an entry that inflates far past what its header declares is stopped, not unpacked", async () => {
  // 30 MB of zeros deflates to a few KB. The central directory says it is 1 byte. The cap has to be on the output.
  const bomb = new Uint8Array(30 * 1024 * 1024);
  const files = {
    "META-INF/container.xml": container("b.opf"),
    "b.opf": `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Bomb</dc:title></metadata>
      <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>`,
    "a.xhtml": bomb,
  };
  const bytes = makeZip(files);
  // Lie about the uncompressed size in both headers, the way a hostile file would.
  const view = new DataView(bytes.buffer);
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (view.getUint32(i, true) === 30 * 1024 * 1024) view.setUint32(i, 1, true);
  }
  await assert.rejects(epubToArticle(asFile(bytes), parse), (e) => e instanceof EpubError && /too large/.test(e.message));
});

test("a file cut short says so instead of surfacing a stream error", async () => {
  const whole = epub3();
  const cut = whole.slice(0, whole.length - 400);
  // The directory is gone with the tail, so the honest answer is "not an EPUB"; a cut inside an entry is the other shape.
  await assert.rejects(epubToArticle(asFile(cut), parse), (e) => e instanceof EpubError);
  const hollow = whole.slice();
  // Keep the directory, blank the first chapter's deflate body so the inflater sees garbage.
  const marker = new TextEncoder().encode("OEBPS/text/ch 1.xhtml");
  const at = hollow.findIndex((_, i) => marker.every((b, j) => hollow[i + j] === b));
  hollow.fill(0xff, at + 30 + marker.length, at + 30 + marker.length + 64);
  await assert.rejects(epubToArticle(asFile(hollow), parse), (e) => e instanceof EpubError && /damaged/.test(e.message));
});

test("end-of-chapter notes and a closing list survive; the article cleaner's footer trimming stays off for books", async () => {
  const notes = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body>
<h1>Chapter Three</h1>
${Array.from({ length: 5 }, (_, i) => `<p>${long("para" + i)}</p>`).join("\n")}
<h2>Notes</h2>
<ol>${Array.from({ length: 9 }, (_, i) => `<li>Note ${i + 1}, short.</li>`).join("")}</ol>
</body></html>`;
  const bytes = makeZip({
    mimetype: "application/epub+zip",
    "META-INF/container.xml": container("content.opf"),
    "content.opf": `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Notes Book</dc:title></metadata>
      <manifest><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c"/></spine></package>`,
    "c.xhtml": notes,
  });
  const a = await epubToArticle(asFile(bytes), parse);
  const text = a.blocks.map((b) => b.runs.map((r) => r.text).join(""));
  assert.ok(text.includes("Notes"), "the Notes heading is kept");
  assert.equal(a.blocks.filter((b) => b.type === "li").length, 9, "every note is kept");
  assert.equal(text.at(-1), "Note 9, short.");
});

test("a chapter listed under two manifest ids is read once, and the whole import has one inflate budget", async () => {
  const files = {
    "META-INF/container.xml": container("b.opf"),
    "b.opf": `<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Twice</dc:title></metadata>
      <manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="./a.xhtml" media-type="application/xhtml+xml"/></manifest>
      <spine><itemref idref="a"/><itemref idref="b"/><itemref idref="a"/></spine></package>`,
    "a.xhtml": chapter("Once", [long("once")]),
  };
  const a = await epubToArticle(asFile(makeZip(files)), parse);
  assert.equal(a.blocks.filter((b) => b.type === "h2").length, 1, "the same file under several ids and itemrefs is one chapter");
  assert.equal(a.blocks.filter((b) => b.type === "p").length, 1);
});
