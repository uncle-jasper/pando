import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/uploads";
import { db } from "@/lib/db";
import { images } from "@/lib/schema";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  // Width/height are computed client-side during the resize step (lib/client-image-resize.ts
  // already has them in hand) and trusted as-is — this is a single-owner admin app, not a
  // public upload endpoint, so there's no one to defend against here. A missing/invalid value
  // just leaves the column null, same as any image uploaded before this existed.
  const widthRaw = form?.get("width");
  const heightRaw = form?.get("height");
  const width = typeof widthRaw === "string" && Number.isFinite(Number(widthRaw)) ? Math.round(Number(widthRaw)) : null;
  const height = typeof heightRaw === "string" && Number.isFinite(Number(heightRaw)) ? Math.round(Number(heightRaw)) : null;

  try {
    const { url, size } = await uploadImage(file);
    const [row] = await db.insert(images).values({ url, size, width, height }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
