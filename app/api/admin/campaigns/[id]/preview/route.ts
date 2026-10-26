import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { renderEmailHtml } from "@/lib/email";
import { getImageDimensions } from "@/lib/imageDimensions";
import { stampSendDate } from "@/lib/sendDate";

// Renders the true email HTML (not the approximate browser-preview pane) for a campaign
// at any status, including drafts — unlike the public /p/[campaignId] view-in-browser
// page, which only serves campaigns that have actually been sent.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const theme = req.nextUrl.searchParams.get("theme") === "dark" ? "dark" : "light";

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return new NextResponse("Not found.", { status: 404 });

  const settings = await getOrCreateSettings();
  const dimensions = await getImageDimensions();
  // forceTheme: true — this preview is an explicit light/dark toggle for visual inspection,
  // so it must render exactly the requested theme regardless of the viewer's own OS/browser
  // color scheme (see the comment on emailCss in lib/email.ts for why that matters here).
  // Drafts preview with today's date in the masthead, as the real send will stamp it
  // (lib/sendDate.ts) — display only, nothing is saved.
  const shown = campaign.status === "draft" ? { ...campaign, markdownBody: stampSendDate(campaign.markdownBody) } : campaign;
  const html = renderEmailHtml(shown, null, settings, theme, true, true, dimensions, "lightbox");
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
