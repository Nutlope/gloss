/** Quick actions on a selection. Shared by the lens (labels) and the server (prompts). */

export type Action = "ask" | "explain" | "define" | "simplify" | "check" | "connect" | "counter";

export const ACTIONS: Record<Action, { label: string; hint: string }> = {
  ask: { label: "سوراش", hint: "ئۇ ھەققىدە خالىغان سوئالنى يېزىڭ" },
  explain: { label: "چۈشەندۈرۈش", hint: "بۇ يەردە نېمىنى بىلدۈرىدۇ ۋە نېمىشقا بۇ يەردە" },
  define: { label: "ئېنىقلىما", hint: "بۇ ئاپتور ئىشلەتكەن مەنىدىكى سۆز" },
  simplify: { label: "ئاددىيلاشتۇرۇش", hint: "ئوخشاش پىكىر ئاددىي سۆزلەر بىلەن" },
  check: { label: "پاكىت تەكشۈرۈش", hint: "ھازىرمۇ توغرىمۇ؟ توردىن ئىزدەيدۇ" },
  connect: { label: "مۇناسىۋەتلىك", hint: "تېكىست بۇنى يەنە قەيەردە تىلغا ئالىدۇ" },
  counter: { label: "قارشى پىكىر", hint: "ئۇنىڭغا ئەڭ كۈچلۈك ئېتىراز" },
};

/** Short selections get Define; longer ones get Simplify in the same slot. */
export const isShortSelection = (quote: string) => quote.trim().split(/\s+/).length <= 4;

export const ARTICLE_QUESTIONS = [
  "ئاساسلىق قاراش ئۈچ جۈملىدە نېمە؟",
  "ئاپتور ئەڭ كۆپ قايسى دەلىلگە تايىنىدۇ؟",
  "ئۆتكۈر گۇمانچى نېمە دەيدۇ؟",
];

/** How a one-click action reads in the notebook, so every entry scans as a question. */
export const ACTION_QUESTIONS: Record<Action, string> = {
  ask: "سوئالىڭىز",
  explain: "بۇ بۇ يەردە نېمىنى بىلدۈرىدۇ؟",
  define: "بۇ سۆز بۇ يەردە نېمە مەنىدە؟",
  simplify: "تېخىمۇ ئاددىي دەپ بېرەلەمسىز؟",
  check: "بۇ ھازىرمۇ توغرىمۇ؟",
  connect: "تېكىست بۇنى يەنە قەيەردە تىلغا ئالىدۇ؟",
  counter: "ئەڭ كۈچلۈك ئېتىراز نېمە؟",
};
