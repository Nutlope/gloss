# Gloss — ئۇيغۇرچە نەشرى

بۇ [Nutlope/gloss](https://github.com/Nutlope/gloss) نىڭ ئۇيغۇرچە (ئەرەب يېزىقى، ئوڭدىن سولغا) نەشرى. خالىغان قۇرنى بەلگىلەپ، ئۇنىڭدىن خالىغاننى سوراڭ؛ جاۋاب ھاشىيەدە پەيدا بولىدۇ.
ئېكران خېتى: ALKATIP Basma.

---

<p align="center">
  <a href="https://usegloss.io"><img alt="Gloss" src="public/og.png"></a>
</p>

<h1 align="center">Gloss</h1>

<p align="center">A reader for articles, chapters and PDFs: select any line, start typing, and an open model writes the answer in the margin beside it, citing paragraphs you can check: <a href="https://usegloss.io">usegloss.io</a></p>

## Tech stack

- Next.js 16 (App Router, Turbopack), React 19, Tailwind v4, Zustand. Local-first: texts live in IndexedDB, and glosses, highlights and settings in localStorage, all in the browser and all working signed out.
- Optional accounts with Clerk. Signed in, your shelf, texts, highlights, notes, glosses and reading progress sync to Postgres on Neon (`lib/sync.ts`, `app/api/sync`); a text is fetched onto another device when it is opened there.
- Your own notes on any highlight, in the margin beside the model's (`Lens.tsx`, `Margin.tsx`). A daily review on the home page brings back five of your highlights, spaced like flashcards (`lib/review.ts`); the shelf searches every highlight and note, and exports them all as Markdown files ready for Obsidian (`lib/export.ts`, `lib/zip.ts`).
- The library (`/library`, `components/library/`): everything on your shelf as a bookcase, arranged by topic, recency, colour or length, with a topic view of painted plates and a 3D book that comes off the shelf. Any text can be renamed (click its title, there or in the shelf sheet), and the three samples can be taken off the shelf, remembered per device (`hiddenSamples` in `lib/library-prefs.ts`). Every new text is sorted onto one of 24 fixed topics, with a few tags, by one DeepSeek V4.1 Flash call (`lib/shelve.ts`, `app/api/shelve`, about $0.0001 a text); texts from before are sorted the first time the library opens (`lib/shelving.ts`). Covers show the page's own picture printed in the topic's ink; painted covers (FLUX.2 [dev], `lib/paint.ts`) are opt-in under Aa, kept on the device and, signed in, with the account (`covers`). Topic plates and icons are generated art in `public/library/`.
- Agents can save to the library through an MCP server at `/mcp` (`lib/mcp.ts`): Streamable HTTP, stateless, four tools (`save_articles`, `save_text`, `search_library`, `list_topics`). Each reader makes a token in the library under Connect an agent (`app/api/agent-tokens`, only its hash is stored in `agent_tokens`), sent as `Authorization: Bearer gls_...` or as the last part of the URL. Saved links go through the same importer as the site (`lib/fetch-article.ts`); `save_text` takes Markdown the agent read itself, for what Gloss can't fetch (X Articles and long posts, video transcripts, pages behind a login). Both are sorted and written to the reader's synced shelf, so they appear on the next sync. Up to 25 links a call, one text a call, and 1,000 saves a day.
- Read aloud, off by default (Aa, then Listen): Cartesia Sonic 3 on Together, a passage at a time, fetched just ahead of the voice (`app/api/speak`, `components/reader/Listen.tsx`). It always uses the reader's own key.
- Free use of the shared key is a dollar budget (`lib/quota.ts`): what answers and briefs actually cost, up to 10¢ a day signed out (by hashed IP) or 20¢ signed in, and $1,000 a day across everyone, kept in Postgres (`free_usage`).
- Newsreader and Schibsted Grotesk, plus Literata and Atkinson Hyperlegible as optional reading faces; six themes, four pens and four highlighters from CSS variables, applied before first paint.
- Together AI over raw SSE fetch: DeepSeek V4.1 Flash (Quick, about 0.5s to first token) and Kimi K3 (Deep, at low reasoning effort), allow-listed in `lib/models.ts`.
- Web search with Exa (`lib/search.ts`, instant mode, about 0.5s): the model gets a `web_search` tool and decides when to look something up (a named person, organisation, work, or anything newer than the text); Fact-check always searches. On by default, the Web toggle turns it off. Results are cited as [1], [2] beside the text's own [¶n].
- The whole text goes in the system prompt with `[¶n]` numbers, so follow-ups hit Together's prefix cache and answers cite paragraphs.
- Anchors are block id plus character offsets, rendered as React marks; margin layout and leader lines in `components/reader/Margin.tsx`.
- Import: links through `@mozilla/readability` on `linkedom` (with a private-address guard), keeping figures (by their original URL, loaded without a referrer) and data tables (which the model reads too); plus pasted text and `.txt`/`.md`. Posts and videos (X, Threads, Bluesky, YouTube and the like) are turned away with a pointer to Paste text (`notAnArticle` in `lib/fetch-article.ts`). Two bookmarklets in the library's Add panel open any page at `/?url=` (read now) or `/?save=` (shelve for later); the same panel takes a Pocket, Instapaper or Raindrop export and saves its links 100 at a time.
- PDFs (`lib/pdf.ts`): LiteParse, Rust compiled to WebAssembly (`public/liteparse-2.15.1.wasm`, copied from `@llamaindex/liteparse-wasm`), reads the text layer in the browser, columns, headings, lists and tables, in milliseconds. Pages with no usable text (scans, garbled glyphs) are rendered and read by Qwen3.8 Flash on Together (`app/api/pdf-page`). Over 20 pages needs the reader's own key, since every question sends the whole text. The original PDF is kept in IndexedDB on that device. Pages whose layout looks hard (columns, tables, maths) are read again in the background by Qwen3.5-9B (`lib/upgrade.ts`, mode "layout" in `app/api/pdf-page`) and swapped in one at a time, while nothing cites their paragraphs yet. When columns, tables or maths still come out jumbled, "Read it more carefully" (`lib/careful.ts`, `app/api/pdf-careful`) reads the PDF again with LlamaParse's agentic tier, for readers with their own Together key, up to 200 pages a day each.

## Cloning & running

1. Install: `npm install`
2. Add keys to `.env.local` (see `.env.example`): `TOGETHER_API_KEY` (without one, answers are labelled demo output and readers can paste their own key in the app), `DATABASE_URL` from Neon, and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from Clerk
3. Create the tables: `npm run db:migrate` (safe to run again)
4. Run: `npm run dev`, open http://localhost:3100, and paste a link (or press ⌘V anywhere), or open the library and shelve a few classics
5. Read: select text and type to ask, `/` asks about the whole text, `j` and `k` walk paragraphs, `B` glosses the whole text, `F` is focus mode, `?` lists every key
6. Check: `npm run lint && npm run build`, then deploy with `vercel --prod` (set the same variables, plus `NEXT_PUBLIC_SITE_URL=https://usegloss.io`, in the project first)

## Roadmap

- [ ] ship it as a browser extension that opens the same margin on any page
- [ ] let a gloss compare two passages you pick at once
- [ ] move the shared-key rate limit from memory to a store like Upstash so it holds across instances
- Accounts are skipped on purpose for now: the reader should work the second you paste a link.

## Security

`TOGETHER_API_KEY` stays server side. A key a reader pastes lives in their browser's localStorage and is sent only with their own requests. Free use of the shared key is capped per reader per day in dollars, and in total, as above; reading aloud ($65 per million characters on Sonic 3) never uses it; link import refuses private, loopback and link-local addresses on every redirect hop.

Samples, all public domain via Project Gutenberg: Huxley, "On a Piece of Chalk" (1868); Schopenhauer, "On Thinking for Oneself" (trans. T. Bailey Saunders); Thoreau, "Reading" from Walden (1854). Rebuild them with `scripts/build-samples.mjs`; dashes are normalized to plain punctuation.
