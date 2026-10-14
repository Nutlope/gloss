import chalk from "@/content/on-a-piece-of-chalk.json";
import thinking from "@/content/on-thinking-for-oneself.json";
import walden from "@/content/walden-reading.json";
import type { Article } from "./article";

/** Bundled texts. Public domain, so they ship in full. */
export const SAMPLES: Article[] = [chalk, thinking, walden].map((a) => ({ ...(a as Article), origin: "sample" as const }));

export const sampleById = (id: string) => SAMPLES.find((a) => a.id === id) ?? null;

/** Starter questions per sample, where the age of the text is the interesting part. */
export const SAMPLE_QUESTIONS: Record<string, string[]> = {
  "on-a-piece-of-chalk": ["ئاساسلىق قاراش ئۈچ جۈملىدە نېمە؟", "1868-يىلدىن بۇيان ئىلىم-پەن نېمىلەرنى ئۆگەندى؟", "نېمىشقا بۇنى ئىشچىلارغا لېكسىيە قىلىدۇ؟"],
  "on-thinking-for-oneself": ["ئاساسلىق قاراش ئۈچ جۈملىدە نېمە؟", "ئۇ ئوقۇشقا قارشىمۇ؟", "ئۇ ئىنتېرنېتقا قانداق قارايدۇ؟"],
  "walden-reading": ["ئاساسلىق قاراش ئۈچ جۈملىدە نېمە؟", "ئۇ «قەھرىمانلىق كىتابلار» دېگەندە نېمىنى كۆزدە تۇتىدۇ؟", "ئۇ ئېلىتىزىمچىمۇ؟"],
};
