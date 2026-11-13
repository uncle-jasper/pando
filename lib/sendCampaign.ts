import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { campaigns, subscribers, sends } from "./schema";
import { getOrCreateSettings } from "./settings";
import { renderEmailHtml, unsubscribeHeaders } from "./email";
import { sendEmail } from "./resend";
import { getImageDimensions, type ImageDimensions } from "./imageDimensions";

// Resend's free tier caps at 100 emails/day. Batches stay under that (with headroom
// for test sends and confirmation emails also drawn from the same daily quota) so a
// campaign can grow past 100 subscribers without needing a paid plan — it just spreads
// across multiple days via the daily cron in app/api/cron/send-batches/route.ts instead
// of failing partway through a single oversized send.
export const SEND_BATCH_SIZE = 90;

// Emails within a batch are sent concurrently (not one at a time) so a full batch
// finishes in a few seconds rather than tens of seconds — sequential sends at ~90
// recipients could exceed Vercel's function duration limit even on Hobby's max
// (60s) once network latency to Resend is accounted for. 8 concurrent requests keeps
// well clear of that while not hammering Resend's own rate limits.
const SEND_CONCURRENCY = 8;

// Resend also caps the API at 10 requests/second. Firing 8-at-a-time chunks back to back blew
// past that on the first real send (vol. 000: one subscriber got a 429 "Too many requests").
// Each chunk now takes at least this long, so the send rate stays around 7/second.
const MIN_CHUNK_MS = 1100;

// Failures that look temporary (rate limit, Resend hiccup) are retried once right away after a
// short pause. Anything still failing is left for the nightly cron to retry (see below).
const RETRY_DELAY_MS = 1500;

// A subscriber whose send has failed twice (once in the original run, once on the nightly retry)
// is given up on: their error is prefixed with this marker and they're skipped from then on, so a
// genuinely bad address can't keep a campaign in "sending" forever.
const GIVE_UP_PREFIX = "[gave up] ";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Done with this subscriber for this campaign: delivered, or failed twice and given up on.
function isFinished(s: typeof sends.$inferSelect): boolean {
  return (
    s.status === "sent" ||
    s.status === "delivered" ||
    s.status === "bounced" ||
    (s.status === "failed" && (s.error ?? "").startsWith(GIVE_UP_PREFIX))
  );
}

function isTemporary(message: string): boolean {
  return /too many requests|rate limit|429|timeout|timed out|network|fetch failed|ECONNRESET|internal server error|503|502/i.test(message);
}

interface BatchResult {
  sent: number;
  failed: number;
  remaining: number;
  total: number;
}

async function sendToOne(
  campaignId: string,
  campaign: typeof campaigns.$inferSelect,
  subscriber: typeof subscribers.$inferSelect,
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
  dimensions: ImageDimensions
): Promise<"sent" | "failed"> {
  const html = renderEmailHtml(campaign, subscriber, settings, "light", false, false, dimensions, "link");
  const send = () =>
    sendEmail({
      to: subscriber.email,
      from: `${settings.fromName} <${settings.fromEmail}>`,
      replyTo: settings.replyTo,
      subject: campaign.subject,
      html,
      headers: unsubscribeHeaders(subscriber.id),
    });
  try {
    let result;
    try {
      result = await send();
    } catch (firstErr: unknown) {
      const msg = firstErr instanceof Error ? firstErr.message : "";
      if (!isTemporary(msg)) throw firstErr;
      await sleep(RETRY_DELAY_MS);
      result = await send();
    }
    await db.insert(sends).values({
      campaignId,
      subscriberId: subscriber.id,
      status: "sent",
      providerMessageId: result?.id,
      sentAt: new Date(),
    });
    return "sent";
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Send failed.";
    // Failed sends aren't retried automatically on the next batch — an existing
    // "failed" row for this subscriber+campaign would otherwise be invisible to the
    // unsent filter below (only "sent"/"delivered" count as completed), so this
    // subscriber is naturally retried next batch. Overwrite any prior failed row
    // to avoid duplicate log entries across retries.
    const [priorFailure] = await db
      .select()
      .from(sends)
      .where(and(eq(sends.campaignId, campaignId), eq(sends.subscriberId, subscriber.id)));
    if (priorFailure) {
      // Second failure for this subscriber+campaign: stop retrying them.
      await db
        .update(sends)
        .set({ status: "failed", error: GIVE_UP_PREFIX + message })
        .where(eq(sends.id, priorFailure.id));
    } else {
      await db.insert(sends).values({ campaignId, subscriberId: subscriber.id, status: "failed", error: message });
    }
    return "failed";
  }
}

export async function sendCampaignBatch(campaignId: string, batchSize = SEND_BATCH_SIZE): Promise<BatchResult> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
  if (!campaign) throw new Error("Campaign not found.");

  const settings = await getOrCreateSettings();
  const dimensions = await getImageDimensions();
  const allRecipients = await db.select().from(subscribers).where(eq(subscribers.status, "subscribed"));
  const existingSends = await db.select().from(sends).where(eq(sends.campaignId, campaignId));
  const completedIds = new Set(existingSends.filter(isFinished).map((s) => s.subscriberId));

  const unsent = allRecipients.filter((r) => !completedIds.has(r.id));
  const batch = unsent.slice(0, batchSize);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < batch.length; i += SEND_CONCURRENCY) {
    const started = Date.now();
    const chunk = batch.slice(i, i + SEND_CONCURRENCY);
    const outcomes = await Promise.all(chunk.map((subscriber) => sendToOne(campaignId, campaign, subscriber, settings, dimensions)));
    for (const outcome of outcomes) {
      if (outcome === "sent") sent++;
      else failed++;
    }
    const elapsed = Date.now() - started;
    if (i + SEND_CONCURRENCY < batch.length && elapsed < MIN_CHUNK_MS) await sleep(MIN_CHUNK_MS - elapsed);
  }

  // Anyone who failed in this run (and hasn't been given up on) still needs it. Keep the campaign
  // in "sending" so tomorrow night's cron retries them; a second failure gives up on them.
  const afterSends = await db.select().from(sends).where(eq(sends.campaignId, campaignId));
  const doneNow = new Set(afterSends.filter(isFinished).map((s) => s.subscriberId));
  const remaining = allRecipients.filter((r) => !doneNow.has(r.id)).length;
  if (remaining <= 0) {
    await db.update(campaigns).set({ status: "sent", sentAt: new Date() }).where(eq(campaigns.id, campaignId));
  } else if (campaign.status !== "sending") {
    await db.update(campaigns).set({ status: "sending" }).where(eq(campaigns.id, campaignId));
  }

  return { sent, failed, remaining: Math.max(remaining, 0), total: allRecipients.length };
}
