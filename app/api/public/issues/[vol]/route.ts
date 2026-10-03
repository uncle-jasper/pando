import { NextResponse } from "next/server";
import { getSentIssues, linkOf, originFor } from "@/lib/issues";

// Public, read-only single issue (sent issues only). `vol` is the volume number, e.g. /api/public/issues/1.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ vol: string }> }) {
  const { vol } = await params;
  const n = parseInt(vol, 10);
  if (!Number.isFinite(n)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const issues = await getSentIssues(originFor(req)); // newest volume first
  const idx = issues.findIndex((i) => i.vol === n);
  if (idx === -1) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      issue: issues[idx],
      // issues is newest-first, so "next" (newer) is the entry before this one.
      prev: linkOf(issues[idx + 1]),
      next: linkOf(issues[idx - 1]),
    },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
