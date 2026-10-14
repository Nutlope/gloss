/** Every outbound URL in one place. */
export const BRAND = {
  name: "Gloss",
  togetherUrl: "https://www.together.ai",
  keysUrl: "https://api.together.ai/settings/api-keys",
  modelsUrl: "https://www.together.ai/models",
} as const;


/** The social card. The version busts the caches of X, Slack and LinkedIn, which keep a card image by its URL. */
export const OG_IMAGE = { url: "/og.jpg?v=3", width: 1200, height: 630, alt: "Gloss: خالىغان قۇرنى بەلگىلەڭ، خالىغاننى سوراڭ. Together AI ئارقىلىق ئىشلەيدۇ." };

/** The public origin, for canonical, sitemap and social card URLs. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3100");
