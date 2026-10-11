import type { Metadata } from "next";
import { Library } from "@/components/library/Library";
import "./library.css";
import "./edition.css";

export const metadata: Metadata = { title: "Library", alternates: { canonical: "/library" } };

export default function LibraryPage() {
  return <Library />;
}
