import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { deriveTitle } from "@/lib/markdown/parse";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be edited." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const update: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };

  if (typeof body.markdownBody === "string") {
    update.markdownBody = body.markdownBody;
    update.title = deriveTitle(body.markdownBody) || existing.title;
  }
  if (typeof body.subject === "string") update.subject = body.subject;
  if (typeof body.preheader === "string") update.preheader = body.preheader;
  if (typeof body.heroImageUrl === "string" || body.heroImageUrl === null) update.heroImageUrl = body.heroImageUrl;
  if (typeof body.heroImageAlt === "string" || body.heroImageAlt === null) update.heroImageAlt = body.heroImageAlt;

  const [row] = await db.update(campaigns).set(update).where(eq(campaigns.id, id)).returning();
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be deleted." }, { status: 409 });
  }
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
