/**
 * Read aloud: Cartesia on Together. Sonic 3 is the newest Cartesia model
 * served serverless (Sonic 3.5 is listed, but only on dedicated endpoints;
 * checked 2026-10-09). Swap the id here when that changes.
 */
export const TTS_URL = "https://api.together.xyz/v1/audio/speech";
export const TTS_MODEL = "cartesia/sonic-3";
/** "Marian - Poised Narrator": even and unhurried, made for long reading. */
export const TTS_VOICE = "26403c37-80c1-4a1a-8692-540551ca2ae5";
/** One request's worth of text. Paragraphs past this are split at sentence ends. */
export const TTS_MAX_CHARS = 1200;

/**
 * The podcast's two hosts, from the Sonic 3 catalog (checked 2026-10-11):
 * Cartesia's own conversational voices, one leading and one asking.
 * Their first names are the names they go by on air.
 */
export const PODCAST_HOSTS = [
  { name: "Allie", voice: "2747b6cf-fa34-460c-97db-267566918881" }, // "Allie - Natural Conversationalist"
  { name: "Carson", voice: "86e30c1d-714b-4074-a1f2-1cb6b552fb49" }, // "Carson - Curious Conversationalist"
] as const;
