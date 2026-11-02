import { NextRequest, NextResponse } from "next/server";
import { startCampaignSend } from "@/lib/startSend";

// Opt into Vercel Hobby's maximum allowed duration (default is much shorter) — a
// full batch of concurrent sends should finish in seconds, but this gives headroom
// under slow network conditions rather than risking a mid-batch timeout.
export const maxDuration = 60;

// Sends the first batch (up to SEND_BATCH_SIZE) immediately, so small lists finish
// in one request. If the list is larger, the campaign stays in "sending" status and
// the daily cron (app/api/cron/send-batches) continues it automatically.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await startCampaignSend(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ sent: result.sent, failed: result.failed, remaining: result.remaining, total: result.total });
}
