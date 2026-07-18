import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/schema";
import { getOrCreateSettings } from "@/lib/settings";
import { eq } from "drizzle-orm";

export async function GET() {
  const row = await getOrCreateSettings();
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest) {
  const row = await getOrCreateSettings();
  const body = await req.json().catch(() => ({}));

  const update: Partial<typeof settings.$inferInsert> = {};
  if (typeof body.fromName === "string") update.fromName = body.fromName;
  if (typeof body.fromEmail === "string") update.fromEmail = body.fromEmail;
  if (typeof body.replyTo === "string" || body.replyTo === null) update.replyTo = body.replyTo;
  if (typeof body.physicalMailingAddress === "string") update.physicalMailingAddress = body.physicalMailingAddress;
  if (typeof body.fontFamily === "string") update.fontFamily = body.fontFamily;
  if (typeof body.lightBg === "string") update.lightBg = body.lightBg;
  if (typeof body.lightText === "string") update.lightText = body.lightText;
  if (typeof body.lightMuted === "string") update.lightMuted = body.lightMuted;
  if (typeof body.darkBg === "string") update.darkBg = body.darkBg;
  if (typeof body.darkText === "string") update.darkText = body.darkText;
  if (typeof body.darkMuted === "string") update.darkMuted = body.darkMuted;

  const [updated] = await db.update(settings).set(update).where(eq(settings.id, row.id)).returning();
  return NextResponse.json(updated);
}
