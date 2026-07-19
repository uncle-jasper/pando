import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { templates } from "@/lib/schema";

export async function GET() {
  const rows = await db.select().from(templates).orderBy(desc(templates.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(templates)
    .values({ name: typeof body.name === "string" ? body.name : "" })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
