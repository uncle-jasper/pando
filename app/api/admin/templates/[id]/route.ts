import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/schema";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(templates).where(eq(templates.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const update: Partial<typeof templates.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.markdownBody === "string") update.markdownBody = body.markdownBody;
  if (typeof body.heroImageUrl === "string" || body.heroImageUrl === null) update.heroImageUrl = body.heroImageUrl;
  if (typeof body.heroImageAlt === "string" || body.heroImageAlt === null) update.heroImageAlt = body.heroImageAlt;

  const [row] = await db.update(templates).set(update).where(eq(templates.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(templates).where(eq(templates.id, id));
  return NextResponse.json({ ok: true });
}
