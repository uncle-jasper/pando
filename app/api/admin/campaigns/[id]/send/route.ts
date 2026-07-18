import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, subscribers } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { sendCampaignBatch } from "@/lib/sendCampaign";

// Opt into Vercel Hobby's maximum allowed duration (default is much shorter) — a
// full batch of concurrent sends should finish in seconds, but this gives headroom
// under slow network conditions rather than risking a mid-batch timeout.
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be sent." }, { status: 409 });
  }
  if (!campaign.subject.trim()) {
    return NextResponse.json({ error: "Add a subject line before sending." }, { status: 400 });
  }

  const settings = await getOrCreateSettings();
  if (!settings.fromEmail) {
    return NextResponse.json({ error: "Set a From email in Settings before sending." }, { status: 400 });
  }
  if (!settings.physicalMailingAddress.trim()) {
    return NextResponse.json({ error: "Set a physical mailing address in Settings before sending (required for compliance)." }, { status: 400 });
  }

  const recipients = await db.select().from(subscribers).where(eq(subscribers.status, "subscribed"));
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No subscribed recipients to send to." }, { status: 400 });
  }

  // Sends the first batch (up to SEND_BATCH_SIZE) immediately, so small lists finish
  // in one request as before. If the list is larger, the campaign stays in "sending"
  // status and the daily cron (app/api/cron/send-batches) continues it automatically.
  const result = await sendCampaignBatch(id);
  return NextResponse.json(result);
}
