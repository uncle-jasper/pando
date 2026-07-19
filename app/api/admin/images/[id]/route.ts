import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { images } from "@/lib/schema";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(images).where(eq(images.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Deleting here is a deliberate, manual action — an image can be referenced by markdown
  // in more than one campaign, and there's no reference tracking, so we don't try to guess
  // when it's "safe" to auto-delete. If it's still linked from a sent campaign's stored
  // HTML, that link will just start 404ing, same as deleting any other file you host yourself.
  await del(row.url).catch(() => {});
  await db.delete(images).where(eq(images.id, id));
  return NextResponse.json({ ok: true });
}
