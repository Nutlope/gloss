/**
 * Where an edition's PDFs are kept for the printer to fetch: Vercel Blob,
 * public at an unguessable address. Without a Blob token (local runs), they
 * go to .data/editions and are served by /api/editions/files, which only a
 * test order uses: Lulu cannot reach localhost.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const blobReady = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const DIR = path.join(process.cwd(), ".data", "editions");
const SAFE = /^[A-Za-z0-9_-]+\.pdf$/;

export async function putFile(name: string, bytes: Uint8Array): Promise<string> {
  if (blobReady()) {
    const { put } = await import("@vercel/blob");
    const r = await put(`editions/${name}`, Buffer.from(bytes), { access: "public", contentType: "application/pdf", addRandomSuffix: true });
    return r.url;
  }
  if (process.env.VERCEL) throw new Error("Set BLOB_READ_WRITE_TOKEN so the printer can fetch the files.");
  if (!SAFE.test(name)) throw new Error("Bad file name.");
  await mkdir(DIR, { recursive: true });
  await writeFile(path.join(DIR, name), bytes);
  return `/api/editions/files/${name}`;
}

/** A file kept on this machine, for a test order. */
export async function localFile(name: string): Promise<Uint8Array | null> {
  if (!SAFE.test(name)) return null;
  try {
    return new Uint8Array(await readFile(path.join(DIR, name)));
  } catch {
    return null;
  }
}
