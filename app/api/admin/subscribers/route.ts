import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/schema";

export async function GET() {
  const rows = await db.select().from(subscribers).orderBy(desc(subscribers.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  try {
    // Manually added by the admin: presumed consent already exists (e.g. migrating
    // an existing list), so this skips the public double opt-in flow and goes
    // straight to "subscribed" rather than "pending".
    const [row] = await db
      .insert(subscribers)
      .values({
        email,
        name: typeof body.name === "string" ? body.name.trim() || null : null,
        status: "subscribed",
        source: "admin",
        confirmedAt: new Date(),
      })
      .returning();
    return NextResponse.json(row, { status: 201 });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "That email is already on the list." }, { status: 409 });
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err && err.code === "23505") return true;
  if ("cause" in err) return isUniqueViolation((err as { cause: unknown }).cause);
  return false;
}
