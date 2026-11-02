import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { sendCampaignBatch } from "@/lib/sendCampaign";
import { startCampaignSend } from "@/lib/startSend";
import { clearSchedule, getDueCampaignIds } from "@/lib/schedule";
import { todayInTaipei } from "@/lib/sendDate";
import { getOrCreateSettings } from "@/lib/settings";
import { sendEmail } from "@/lib/resend";

export const maxDuration = 60;

// Vercel Cron calls this once a day (see vercel.json: 13:00 UTC = 9 PM Taipei; Hobby crons
// may fire anywhere within that hour) with an Authorization header matching CRON_SECRET.
//  1. Continues any campaign still in "sending" status (lists bigger than one day's
//     Resend quota).
//  2. Starts any draft whose scheduled send date (lib/schedule.ts) has arrived.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const inProgress = await db.select().from(campaigns).where(eq(campaigns.status, "sending"));

  const results = [];
  for (const campaign of inProgress) {
    const result = await sendCampaignBatch(campaign.id);
    results.push({ campaignId: campaign.id, kind: "resume", ...result });
  }

  const dueIds = await getDueCampaignIds(todayInTaipei());
  for (const id of dueIds) {
    const result = await startCampaignSend(id);
    if (result.ok) {
      results.push({ campaignId: id, kind: "scheduled", ...result });
    } else {
      // Don't retry a broken scheduled send every night: unschedule it and tell Dan why.
      await clearSchedule(id);
      results.push({ campaignId: id, kind: "scheduled", error: result.error });
      await notifyScheduledFailure(id, result.error);
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function notifyScheduledFailure(campaignId: string, error: string) {
  try {
    const settings = await getOrCreateSettings();
    if (!settings.notifyEmail || !settings.fromEmail) return;
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));
    const name = campaign?.title || campaign?.subject || "(untitled)";
    const base = (process.env.APP_URL || "https://pando.danbenson.me").replace(/\/$/, "");
    await sendEmail({
      to: settings.notifyEmail,
      from: `Pando <${settings.fromEmail}>`,
      subject: `Scheduled send didn't go out: ${name}`,
      html: `<p>Pando tried to send <strong>${escapeHtml(name)}</strong> as scheduled, but couldn't:</p>
<p>${escapeHtml(error)}</p>
<p>It's still a draft and is no longer scheduled. Fix the problem, then send or reschedule it:
<a href="${base}/admin/campaigns/${campaignId}">${base}/admin/campaigns/${campaignId}</a></p>`,
    });
  } catch {
    // best effort — the failure is also in the cron response / Vercel logs
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
