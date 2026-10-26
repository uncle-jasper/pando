import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { renderEmailHtml } from "@/lib/email";
import { getImageDimensions } from "@/lib/imageDimensions";
import { sendEmail } from "@/lib/resend";
import { makePreviewKey } from "@/lib/tokens";
import { stampSendDate } from "@/lib/sendDate";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "A valid test recipient email is required." }, { status: 400 });
  }

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const settings = await getOrCreateSettings();
  if (!settings.fromEmail) {
    return NextResponse.json({ error: "Set a From email in Settings before sending." }, { status: 400 });
  }

  const dimensions = await getImageDimensions();
  // Show the date the real send will stamp in (see lib/sendDate.ts), without saving it.
  const html = renderEmailHtml(
    { ...campaign, markdownBody: campaign.status === "draft" ? stampSendDate(campaign.markdownBody) : campaign.markdownBody },
    null,
    settings,
    "light",
    false,
    false,
    dimensions,
    "link",
    // Drafts aren't public, so the test email's photo links carry a signed key that lets
    // just this draft's web page open (see makePreviewKey in lib/tokens.ts).
    campaign.status === "draft" ? `${process.env.APP_URL || "http://localhost:3000"}/p/${campaign.id}?k=${makePreviewKey(campaign.id)}` : undefined
  );

  try {
    await sendEmail({
      to,
      from: `${settings.fromName} <${settings.fromEmail}>`,
      replyTo: settings.replyTo,
      subject: `[TEST] ${campaign.subject || campaign.title || "(no subject)"}`,
      html,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
