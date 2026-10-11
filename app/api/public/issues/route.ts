import { NextResponse } from "next/server";
import { getSentIssues, originFor, summarize } from "@/lib/issues";

// Public, read-only. Sent issues only (drafts and in-progress sends are never listed). Consumed
// server-side by the danbenson.me WordPress plugin; short CDN cache so a new issue shows up fast.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const issues = await getSentIssues(originFor(req));
  return NextResponse.json(
    { issues: issues.map(summarize) },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
