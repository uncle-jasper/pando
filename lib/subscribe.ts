import { eq } from "drizzle-orm";
import { db } from "./db";
import { subscribers } from "./schema";
import { getOrCreateSettings } from "./settings";
import { makeSubscriberToken } from "./tokens";
import { confirmationEmailHtml, confirmUrlFor } from "./transactional";
import { sendEmail } from "./resend";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function subscribePublic(
  rawEmail: string,
  name: string | undefined,
  source: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "A valid email is required." };
  }

  const [existing] = await db.select().from(subscribers).where(eq(subscribers.email, email));

  let subscriber = existing;
  if (!subscriber) {
    [subscriber] = await db
      .insert(subscribers)
      .values({ email, name: name || null, status: "pending", source })
      .returning();
  } else if (subscriber.status === "subscribed") {
    return { ok: true }; // already subscribed, nothing to do
  } else {
    [subscriber] = await db
      .update(subscribers)
      .set({ status: "pending" })
      .where(eq(subscribers.id, subscriber.id))
      .returning();
  }

  const settings = await getOrCreateSettings();
  if (!settings.fromEmail) {
    return { ok: false, error: "Sending isn't configured yet." };
  }

  const token = makeSubscriberToken(subscriber.id);
  const html = confirmationEmailHtml(confirmUrlFor(token), settings.fromName || "Pando");

  try {
    await sendEmail({
      to: email,
      from: `${settings.fromName} <${settings.fromEmail}>`,
      replyTo: settings.replyTo,
      subject: "Confirm your subscription",
      html,
    });
  } catch {
    return { ok: false, error: "Could not send confirmation email. Try again shortly." };
  }

  return { ok: true };
}
