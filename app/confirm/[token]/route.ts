import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/schema";
import { verifySubscriberToken } from "@/lib/tokens";

function page(message: string): NextResponse {
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Subscription</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#f5f0e8; color:#2c2416; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  main { max-width:420px; text-align:center; padding:32px; }
  h1 { font-size:20px; }
</style>
</head>
<body><main><h1>${message}</h1></main></body>
</html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subscriberId = verifySubscriberToken(token);
  if (!subscriberId) return page("This confirmation link is invalid.");

  const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, subscriberId));
  if (!subscriber) return page("This confirmation link is invalid.");

  if (subscriber.status !== "subscribed") {
    await db
      .update(subscribers)
      .set({ status: "subscribed", confirmedAt: new Date() })
      .where(eq(subscribers.id, subscriberId));
  }

  return page("You're subscribed! Thanks for confirming.");
}
