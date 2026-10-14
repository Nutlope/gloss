import { auth } from "@clerk/nextjs/server";
import { makeToken } from "@/lib/agent";
import { createToken, listTokens, revokeToken } from "@/lib/db";

export const runtime = "nodejs";

const MAX_TOKENS = 10;

/** The reader's agent connections: list them, make one (its token shown once), or revoke one. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ۋاكالەتچى ئۇلاش ئۈچۈن كىرىڭ." }, { status: 401 });
  return Response.json({ tokens: await listTokens(userId) });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ۋاكالەتچى ئۇلاش ئۈچۈن كىرىڭ." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { label?: string };
  if ((await listTokens(userId)).length >= MAX_TOKENS) return Response.json({ error: `سىزدە ${MAX_TOKENS} ئۇلىنىش بار. ئاۋۋال بىرىنى بىكار قىلىڭ.` }, { status: 409 });
  const t = makeToken();
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 40) : "Agent";
  await createToken(userId, t.id, t.hash, label);
  return Response.json({ id: t.id, label, token: t.token });
}

export async function DELETE(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ئاۋۋال كىرىڭ." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  return (await revokeToken(userId, id)) ? Response.json({ ok: true }) : Response.json({ error: "تېپىلمىدى." }, { status: 404 });
}
