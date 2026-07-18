import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";

export async function GET() {
  const rows = await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const [row] = await db
    .insert(campaigns)
    .values({
      title: body.title ?? "",
      subject: body.subject ?? "",
      markdownBody: body.markdownBody ?? "",
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
