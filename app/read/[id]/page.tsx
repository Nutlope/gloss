import type { Metadata } from "next";
import { Reader } from "@/components/reader/Reader";
import { sampleById } from "@/lib/samples";
import { OG_IMAGE } from "@/lib/brand";

type Props = { params: Promise<{ id: string }> };

/**
 * Samples ship with the app, so their links unfurl with the text's own title and dek.
 * Imported texts live in the browser: the reader renders their <title>, and crawlers,
 * who would only ever see "not on this device", are asked to pass them by.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = sampleById((await params).id);
  if (!a) return { robots: { index: false } };
  const title = `${a.title}, glossed`;
  const description = a.dek ?? `${a.title}${a.author ? `، ئاپتورى: ${a.author}` : ""}. خالىغان قۇرنى بەلگىلەپ، ئۇنىڭدىن خالىغاننى سوراڭ.`;
  return {
    title,
    description,
    alternates: { canonical: `/read/${a.id}` },
    openGraph: { title, description, url: `/read/${a.id}`, type: "article", images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [OG_IMAGE.url] },
  };
}

export default async function ReadPage({ params }: Props) {
  const { id } = await params;
  return <Reader id={id} initial={sampleById(id)} />;
}
