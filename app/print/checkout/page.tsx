import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TestCheckout } from "@/components/print/TestCheckout";
import { testOrders } from "@/lib/stripe";
import "../../library/edition.css";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };

/** Stands in for Stripe's checkout while Stripe is not set up: on a local run, or where EDITIONS_TEST=1. */
export default async function TestCheckoutPage() {
  // Decided per request, from the environment the server runs in, never at build time.
  await connection();
  if (!testOrders()) notFound();
  return <TestCheckout />;
}
