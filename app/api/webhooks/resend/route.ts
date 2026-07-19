import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/schema";

interface ResendWebhookEvent {
  type: string;
  data: { to?: string[]; email?: string };
}

// Resend delivers webhooks (bounce, complaint, etc.) signed via Svix. Verifying the
// signature stops anyone from POSTing fake bounce events to suppress arbitrary
// subscribers. On a real bounce/complaint we mark the subscriber so future sends
// (sendCampaignBatch only targets status="subscribed") automatically skip them —
// this is the "auto-suppression" the plan called for.
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ResendWebhookEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const email = event.data.email ?? event.data.to?.[0];
  if (!email) return NextResponse.json({ ok: true });

  if (event.type === "email.bounced") {
    await db.update(subscribers).set({ status: "bounced" }).where(eq(subscribers.email, email.toLowerCase()));
  } else if (event.type === "email.complained") {
    await db.update(subscribers).set({ status: "complained" }).where(eq(subscribers.email, email.toLowerCase()));
  }

  return NextResponse.json({ ok: true });
}
