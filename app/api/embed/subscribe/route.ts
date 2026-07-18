import { NextRequest, NextResponse } from "next/server";
import { subscribePublic } from "@/lib/subscribe";

// This endpoint is meant to be called cross-origin from the danbenson.me WordPress
// widget (public/widget.js) — CORS is explicitly restricted to that origin, not "*",
// so arbitrary sites can't submit signups against Pando's list.
const ALLOWED_ORIGINS = ["https://danbenson.me", "https://www.danbenson.me", "http://localhost:3000"];

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }
  return {};
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const body = await req.json().catch(() => ({}));
  const result = await subscribePublic(
    typeof body.email === "string" ? body.email : "",
    typeof body.name === "string" ? body.name : undefined,
    "widget"
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400, headers });
  return NextResponse.json({ ok: true }, { headers });
}
