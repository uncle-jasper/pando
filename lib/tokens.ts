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
