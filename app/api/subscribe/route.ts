import { NextRequest, NextResponse } from "next/server";
import { subscribePublic } from "@/lib/subscribe";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const result = await subscribePublic(
    typeof body.email === "string" ? body.email : "",
    typeof body.name === "string" ? body.name : undefined,
    "public"
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
