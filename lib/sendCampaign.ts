import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { campaigns, subscribers, sends } from "./schema";
import { getOrCreateSettings } from "./settings";
import { renderEmailHtml, unsubscribeHeaders } from "./email";
import { sendEmail } from "./resend";

// Resend's free tier caps at 100 emails/day. Batches stay under that (with headroom
// for test sends and confirmation emails also drawn from the same daily quota) so a
// campaign can grow past 100 subscribers without needing a paid plan — it just spreads
// across multiple days via the daily cron in app/api/cron/send-batches/route.ts instead
// of failing partway through a single oversized send.
export const SEND_BATCH_SIZE = 90;

interface BatchResult {
  sent: number;
  failed: number;
  remaining: number;
  total: number;
}

export async function sendCampaignBatch(campaignId: string, batchSize = SEND_BATCH_SIZE): Promise<BatchResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw new Error("Campaign not found.");

  const settings = await getOrCreateSettings();
  const allRecipients = await db.select().from(subscribers).where(eq(subscribers.status, "subscribed"));
  const existingSends = await db.select().from(sends).where(eq(sends.campaignId, campaignId));
  const completedIds = new Set(
    existingSends.filter((s) => s.status === "sent" || s.status === "delivered").map((s) => s.subscriberId)
  );

  const unsent = allRecipients.filter((r) => !completedIds.has(r.id));
  const batch = unsent.slice(0, batchSize);

  let sent = 0;
  let failed = 0;

  for (const subscriber of batch) {
    const html = renderEmailHtml(campaign, subscriber, settings);
    try {
      const result = await sendEmail({
        to: subscriber.email,
        from: `${settings.fromName} <${settings.fromEmail}>`,
        replyTo: settings.replyTo,
        subject: campaign.subject,
        html,
        headers: unsubscribeHeaders(subscriber.id),
      });
      await db.insert(sends).values({
        campaignId,
        subscriberId: subscriber.id,
        status: "sent",
        providerMessageId: result?.id,
        sentAt: new Date(),
      });
      sent++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Send failed.";
      // Failed sends aren't retried automatically on the next batch — an existing
      // "failed" row for this subscriber+campaign would otherwise be invisible to the
      // unsent filter above (only "sent"/"delivered" count as completed), so this
      // subscriber is naturally retried next batch. Overwrite any prior failed row
      // to avoid duplicate log entries across retries.
      const [priorFailure] = await db
        .select()
        .from(sends)
        .where(and(eq(sends.campaignId, campaignId), eq(sends.subscriberId, subscriber.id)));
      if (priorFailure) {
        await db.update(sends).set({ status: "failed", error: message }).where(eq(sends.id, priorFailure.id));
      } else {
        await db.insert(sends).values({ campaignId, subscriberId: subscriber.id, status: "failed", error: message });
      }
      failed++;
    }
  }

  const remaining = unsent.length - batch.length;
  if (remaining <= 0) {
    await db.update(campaigns).set({ status: "sent", sentAt: new Date() }).where(eq(campaigns.id, campaignId));
  } else if (campaign.status !== "sending") {
    await db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, campaignId));
  }

  return { sent, failed, remaining: Math.max(remaining, 0), total: allRecipients.length };
}
