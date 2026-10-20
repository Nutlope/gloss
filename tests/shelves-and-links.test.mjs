import test from "node:test";
import assert from "node:assert/strict";
import { allShelves, cleanTags, customKeyFor, isCustomKey, shelfDef, shelfNameFromKey, shadesFor, topicOf } from "../lib/library.ts";
import { bookmarkBlocks, BOOKMARK_NOTE, isTooLittle } from "../lib/bookmark.ts";

const p = (text) => ({ id: "b1", type: "p", runs: [{ text }] });

test("custom shelf keys are stable, slugged and de-duplicated", () => {
  assert.equal(customKeyFor("Research to Revisit"), "custom-research-to-revisit");
  assert.equal(customKeyFor("Research to Revisit", ["custom-research-to-revisit"]), "custom-research-to-revisit-2");
  assert.ok(isCustomKey("custom-research-to-revisit"));
  assert.ok(!isCustomKey("ai"));
  assert.equal(shelfNameFromKey("custom-research-to-revisit"), "Research To Revisit");
});

test("a custom shelf resolves with a name, cloth and a place in the order", () => {
  const shelves = [{ key: "custom-paper-club", name: "Paper Club" }];
  const def = shelfDef("custom-paper-club", shelves);
  assert.equal(def.name, "Paper Club");
  assert.equal(def.custom, true);
  assert.deepEqual(shadesFor("custom-paper-club"), def.shades);
  assert.equal(topicOf("custom-paper-club", shelves), "custom-paper-club");
  assert.equal(topicOf("custom-paper-club"), "custom-paper-club");
  assert.equal(topicOf("not-a-shelf"), "unsorted");
  assert.equal(topicOf("ai"), "ai");
  const all = allShelves(shelves).map((s) => s.key);
  assert.ok(all.indexOf("custom-paper-club") > all.indexOf("ai"));
  assert.ok(all.indexOf("custom-paper-club") < all.indexOf("unsorted"));
  assert.deepEqual(cleanTags(["Paper Club", "optics"], "custom-paper-club"), ["optics"]);
});

test("too little text is under two paragraphs or under the word floor", () => {
  assert.equal(isTooLittle([p("hello world")]), true);
  assert.equal(isTooLittle([p("one two three"), p("four five six")]), true);
  const long = Array.from({ length: 90 }, (_, i) => `word${i}`).join(" ");
  assert.equal(isTooLittle([p(long), p(long)]), false);
});

test("a saved link carries the note and a way back to the original", () => {
  const blocks = bookmarkBlocks({ dek: "A tool for heroes.", url: "https://example.com/tool" });
  assert.equal(blocks[0].runs[0].text, "A tool for heroes.");
  assert.ok(blocks.some((b) => b.runs[0]?.text === BOOKMARK_NOTE));
  const last = blocks[blocks.length - 1];
  assert.equal(last.runs[0].href, "https://example.com/tool");
  assert.equal(bookmarkBlocks({ url: "https://example.com" }).length, 2);
});
