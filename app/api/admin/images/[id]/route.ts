import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { images } from "@/lib/schema";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.select().from(images).where(eq(images.id, id));
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Deleting here is a deliberate, manual action from the image library, so it always
  // deletes regardless of references (unlike the campaign-delete cleanup in lib/imageCleanup.ts,
  // which only removes images nothing else still points to). If it's still linked from a sent
  // campaign's stored HTML, that link will just start 404ing, same as deleting any file you host.
  await del(row.url).catch(() => {});
  await db.delete(images).where(eq(images.id, id));
  return NextResponse.json({ ok: true });
}
