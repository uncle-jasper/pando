import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { sendCampaignBatch } from "@/lib/sendCampaign";

export const maxDuration = 60;

// Vercel Cron calls this once a day (see vercel.json) with an Authorization header
// matching CRON_SECRET, continuing any campaign still in "sending" status (i.e. one
// whose subscriber list is larger than a single day's Resend send quota).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const inProgress = await db.select().from(campaigns).where(eq(campaigns.status, "sending"));

  const results = [];
  for (const campaign of inProgress) {
    const result = await sendCampaignBatch(campaign.id);
    results.push({ campaignId: campaign.id, ...result });
  }

  return NextResponse.json({ processed: results.length, results });
}
