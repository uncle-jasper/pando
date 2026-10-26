import { NextResponse } from "next/server";
import { verifyArchivePreviewKey } from "@/lib/tokens";
import { getSentIssues, originFor, summarize } from "@/lib/issues";

// Public, read-only. Sent issues only (drafts and in-progress sends are never listed). Consumed
// server-side by the danbenson.me WordPress plugin; short CDN cache so a new issue shows up fast.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Preview mode (drafts included) — see makeArchivePreviewKey in lib/tokens.ts.
  const preview = verifyArchivePreviewKey(req.headers.get("x-pando-preview"));
  const issues = await getSentIssues(originFor(req), preview);
  return NextResponse.json(
    { issues: issues.map(summarize) },
    { headers: { "Cache-Control": preview ? "private, no-store" : "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
