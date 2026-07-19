import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { images } from "@/lib/schema";

export async function GET() {
  const rows = await db.select().from(images).orderBy(desc(images.uploadedAt));
  return NextResponse.json(rows);
}
