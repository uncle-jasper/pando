import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/schema";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.subscribers) ? body.subscribers : [];

  const values = rows
    .map((r: { email?: string; name?: string }) => ({
      email: typeof r.email === "string" ? r.email.trim().toLowerCase() : "",
      name: typeof r.name === "string" ? r.name.trim() || null : null,
    }))
    .filter((r: { email: string }) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));

  if (values.length === 0) {
    return NextResponse.json({ error: "No valid rows to import." }, { status: 400 });
  }

  const inserted = await db
    .insert(subscribers)
    .values(
      values.map((v: { email: string; name: string | null }) => ({
        email: v.email,
        name: v.name,
        status: "subscribed" as const,
        source: "csv_import",
        confirmedAt: new Date(),
      }))
    )
    .onConflictDoNothing({ target: subscribers.email })
    .returning();

  return NextResponse.json({ imported: inserted.length, submitted: values.length });
}
