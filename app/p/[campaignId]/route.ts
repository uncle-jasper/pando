import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { renderEmailHtml } from "@/lib/email";
import { getImageDimensions } from "@/lib/imageDimensions";
import { verifyPreviewKey } from "@/lib/tokens";

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

  // Drafts are never publicly viewable — only campaigns that have actually been sent — except
  // via the signed ?k= key that test emails carry (see makePreviewKey in lib/tokens.ts).
  const key = req.nextUrl.searchParams.get("k");
  const draftPreview = !!campaign && campaign.status === "draft" && !!key && verifyPreviewKey(campaign.id, key);
  if (!campaign || (campaign.status !== "sent" && !draftPreview)) {
    return new NextResponse("Not found.", { status: 404 });
  }

  const settings = await getOrCreateSettings();
  const dimensions = await getImageDimensions();
  const html = renderEmailHtml(campaign, null, settings, "light", false, false, dimensions, "lightbox");
  return new NextResponse(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...(draftPreview ? { "x-robots-tag": "noindex" } : {}),
    },
  });
}
