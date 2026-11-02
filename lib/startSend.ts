import { eq } from "drizzle-orm";
import { db } from "./db";
import { campaigns, subscribers } from "./schema";
import { getOrCreateSettings } from "./settings";
import { sendCampaignBatch } from "./sendCampaign";
import { stampSendDate } from "./sendDate";
import { clearSchedule } from "./schedule";

// Shared by the Send button (app/api/admin/campaigns/[id]/send) and scheduled sends
// (app/api/cron/send-batches): checks the campaign can go out, stamps the masthead date,
// clears any schedule, and sends the first batch. Larger lists continue via the daily cron.

export type StartSendResult =
  | { ok: true; sent: number; failed: number; remaining: number; total: number }
  | { ok: false; status: number; error: string };

export async function startCampaignSend(id: string): Promise<StartSendResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return { ok: false, status: 404, error: "Not found." };
  if (campaign.status !== "draft") {
    return { ok: false, status: 409, error: "Only draft campaigns can be sent." };
  }
  if (!campaign.subject.trim()) {
    return { ok: false, status: 400, error: "Add a subject line before sending." };
  }

  const settings = await getOrCreateSettings();
  if (!settings.fromEmail) {
    return { ok: false, status: 400, error: "Set a From email in Settings before sending." };
  }
  if (!settings.physicalMailingAddress.trim()) {
    return {
      ok: false,
      status: 400,
      error: "Set a physical mailing address in Settings before sending (required for compliance).",
    };
  }

  const recipients = await db.select().from(subscribers).where(eq(subscribers.status, "subscribed"));
  if (recipients.length === 0) {
    return { ok: false, status: 400, error: "No subscribed recipients to send to." };
  }

  // Set the masthead's "-# YYYY-MM-DD" line to today's date before anything goes out, and save
  // it — later batches (cron) and the archive then all use the same, real send date.
  const stamped = stampSendDate(campaign.markdownBody);
  if (stamped !== campaign.markdownBody) {
    await db.update(campaigns).set({ markdownBody: stamped, updatedAt: new Date() }).where(eq(campaigns.id, id));
  }

  // Clear the schedule BEFORE sending, so a crash mid-batch can't make tomorrow's cron start
  // the campaign a second time (it'll be in "sending" status and resume normally instead).
  await clearSchedule(id);

  const result = await sendCampaignBatch(id);
  return { ok: true, ...result };
}
