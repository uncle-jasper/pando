import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { renderEmailHtml } from "@/lib/email";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

  // Drafts are never publicly viewable — only campaigns that have actually been sent.
  if (!campaign || campaign.status !== "sent") {
    return new NextResponse("Not found.", { status: 404 });
  }

  const settings = await getOrCreateSettings();
  const html = renderEmailHtml(campaign, null, settings);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
