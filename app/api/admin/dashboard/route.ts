import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/dashboard";

// Always computed fresh: these are live counts, never worth caching.
export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getDashboardStats();
  return NextResponse.json(stats);
}
