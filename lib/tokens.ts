import { createHmac, timingSafeEqual } from "crypto";

// Stateless HMAC token: unsubscribe/confirm links don't need a stored token
// column — anyone holding a valid token for a given subscriber id can act on
// that subscription, and the token is unforgeable without HMAC_SECRET.
function sign(subscriberId: string): string {
  return createHmac("sha256", process.env.HMAC_SECRET!).update(subscriberId).digest("hex");
}

export function makeSubscriberToken(subscriberId: string): string {
  return `${subscriberId}.${sign(subscriberId)}`;
}

export function verifySubscriberToken(token: string): string | null {
  const [subscriberId, sig] = token.split(".");
  if (!subscriberId || !sig) return null;
  const expected = sign(subscriberId);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return subscriberId;
}

// Signed key that lets a *draft* campaign's /p/[id] page open — used only by test sends, so
// tapping a photo in a test email reaches the lightbox before the issue is actually sent.
// Drafts otherwise stay private (the /p route 404s them without this key).
export function makePreviewKey(campaignId: string): string {
  return sign(`preview:${campaignId}`);
}

export function verifyPreviewKey(campaignId: string, key: string): boolean {
  const a = Buffer.from(key);
  const b = Buffer.from(makePreviewKey(campaignId));
  return a.length === b.length && timingSafeEqual(a, b);
}
