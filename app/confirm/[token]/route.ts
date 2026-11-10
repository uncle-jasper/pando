import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/schema";
import { verifySubscriberToken } from "@/lib/tokens";
import { getOrCreateSettings } from "@/lib/settings";
import { confirmPageHtml, newSubscriberNotificationHtml } from "@/lib/transactional";
import { sendEmail } from "@/lib/resend";

async function page(message: string): Promise<NextResponse> {
  const settings = await getOrCreateSettings();
  const html = confirmPageHtml(message, settings.newsletterName?.trim() || null, settings);
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subscriberId = verifySubscriberToken(token);
  if (!subscriberId) return await page("This confirmation link is invalid.");

  const [subscriber] = await db.select().from(subscribers).where(eq(subscribers.id, subscriberId));
  if (!subscriber) return await page("This confirmation link is invalid.");

  if (subscriber.status !== "subscribed") {
    await db
      .update(subscribers)
      .set({ status: "subscribed", confirmedAt: new Date() })
      .where(eq(subscribers.id, subscriberId));

    // Owner notification — best-effort, fires once per confirmation. A failure here
    // must never break the subscriber's confirmation page.
    try {
      const settings = await getOrCreateSettings();
      if (settings.notifyOnNewSubscriber && settings.notifyEmail && settings.fromEmail) {
        await sendEmail({
          to: settings.notifyEmail,
          from: `${settings.fromName} <${settings.fromEmail}>`,
          subject: "New subscriber",
          html: newSubscriberNotificationHtml(subscriber.email, subscriber.name, settings),
        });
      }
    } catch {
      // Swallow — the subscriber's confirmation already succeeded above.
    }
  }

  return await page("You're subscribed. Thanks for confirming — the next issue will land in your inbox.");
}
