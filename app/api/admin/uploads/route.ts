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

  try {
    const { url, size } = await uploadImage(file);
    const [row] = await db.insert(images).values({ url, size }).returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
