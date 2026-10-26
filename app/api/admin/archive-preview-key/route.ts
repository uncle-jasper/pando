import { NextResponse } from "next/server";
import { makeArchivePreviewKey } from "@/lib/tokens";

// Admin-only (under /api/admin, covered by proxy.ts auth): the key for the WordPress plugin's
// draft-preview mode. See makeArchivePreviewKey in lib/tokens.ts.
export async function GET() {
  return NextResponse.json({ key: makeArchivePreviewKey() });
}
