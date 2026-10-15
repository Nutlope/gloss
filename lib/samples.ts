import chalk from "@/content/on-a-piece-of-chalk.json";
import thinking from "@/content/on-thinking-for-oneself.json";
import walden from "@/content/walden-reading.json";
import { blockText, type Article } from "./article";
import type { Highlight } from "./store";

/** Bundled texts. Public domain, so they ship in full. */
export const SAMPLES: Article[] = [chalk, thinking, walden].map((a) => ({ ...(a as Article), origin: "sample" as const }));

export const sampleById = (id: string) => SAMPLES.find((a) => a.id === id) ?? null;

const TUTORIAL_NOTES: Record<string, { blockId: string; quote: string }> = {
  "on-a-piece-of-chalk": { blockId: "p1", quote: "that white substance almost too soft to be called rock" },
  "on-thinking-for-oneself": { blockId: "p1", quote: "if he has not worked it up by thinking it over for himself" },
  "walden-reading": { blockId: "p1", quote: "in dealing with truth we are immortal" },
};

/** A starter highlight that teaches readers how to add a note in the margin. */
export function tutorialNoteFor(article: Article): Highlight | null {
  const tutorial = TUTORIAL_NOTES[article.id];
  if (!tutorial) return null;

  const block = article.blocks.find((b) => b.id === tutorial.blockId);
  const quote = block ? blockText(block) : "";
  const start = quote.indexOf(tutorial.quote);
  if (!block || start < 0) throw new Error(`Tutorial passage missing from sample ${article.id}`);

  return {
    id: `tutorial-${article.id}`,
    articleId: article.id,
    anchor: {
      start: { b: block.id, o: start },
      end: { b: block.id, o: start + tutorial.quote.length },
      quote: tutorial.quote,
    },
    createdAt: Date.now(),
    color: "yellow",
    note: "Tutorial: select a line to save one of your own thoughts beside the text.",
  };
}

/** Starter questions per sample, where the age of the text is the interesting part. */
export const SAMPLE_QUESTIONS: Record<string, string[]> = {
  "on-a-piece-of-chalk": ["What is the core argument, in three sentences?", "What has science learned since 1868?", "Why lecture this to working men?"],
  "on-thinking-for-oneself": ["What is the core argument, in three sentences?", "Is he against reading?", "How would he see the internet?"],
  "walden-reading": ["What is the core argument, in three sentences?", "What does he mean by heroic books?", "Is he being elitist?"],
};
