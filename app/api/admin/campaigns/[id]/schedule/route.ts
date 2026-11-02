import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns } from "@/lib/schema";
import { clearSchedule, getSchedule, isValidDate, setSchedule } from "@/lib/schedule";
import { todayInTaipei } from "@/lib/sendDate";

// GET → { sendOn: "YYYY-MM-DD" | null }
// PUT { sendOn: "YYYY-MM-DD" } → schedules (or reschedules) a draft for that Taipei date
// DELETE → unschedules
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ sendOn: await getSchedule(id) });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
  if (!campaign) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only drafts can be scheduled." }, { status: 409 });
  }
  const body = await req.json().catch(() => ({}));
  if (!isValidDate(body.sendOn)) {
    return NextResponse.json({ error: "Pick a date." }, { status: 400 });
  }
  if (body.sendOn < todayInTaipei()) {
    return NextResponse.json({ error: "That date has already passed." }, { status: 400 });
  }
  if (!campaign.subject.trim()) {
    return NextResponse.json({ error: "Add a subject line before scheduling." }, { status: 400 });
  }
  await setSchedule(id, body.sendOn);
  return NextResponse.json({ sendOn: body.sendOn });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await clearSchedule(id);
  return NextResponse.json({ sendOn: null });
}
