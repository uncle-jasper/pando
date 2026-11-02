import { neon } from "@neondatabase/serverless";

// Scheduled sends: a draft can be given a send DATE (Taipei calendar day). The daily cron
// (vercel.json, 13:00 UTC = 9 PM Taipei) sends every draft whose date has arrived. No send
// TIME is offered because Vercel Hobby only runs cron jobs once a day, and Hobby crons can
// fire anywhere within the scheduled hour (so "9 PM" really means 9:00–9:59 PM Taipei).
//
// Stored in its own small table instead of a column on `campaigns`, created on first use
// with CREATE TABLE IF NOT EXISTS. That way no `drizzle-kit push` is needed: a new column on
// `campaigns` would break every campaigns query until a push ran against the live DB, but an
// extra table that nothing else reads is invisible until this file touches it. Rows are
// removed when the campaign is sent, unscheduled or deleted (ON DELETE CASCADE).

const sql = neon(process.env.DATABASE_URL!);

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS campaign_schedules (
      campaign_id uuid PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
      send_on text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export async function getSchedule(campaignId: string): Promise<string | null> {
  await ensureTable();
  const rows = await sql`SELECT send_on FROM campaign_schedules WHERE campaign_id = ${campaignId}`;
  return rows.length > 0 ? (rows[0].send_on as string) : null;
}

export async function getAllSchedules(): Promise<Record<string, string>> {
  await ensureTable();
  const rows = await sql`SELECT campaign_id, send_on FROM campaign_schedules`;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.campaign_id as string] = r.send_on as string;
  return out;
}

export async function setSchedule(campaignId: string, sendOn: string) {
  await ensureTable();
  await sql`
    INSERT INTO campaign_schedules (campaign_id, send_on)
    VALUES (${campaignId}, ${sendOn})
    ON CONFLICT (campaign_id) DO UPDATE SET send_on = EXCLUDED.send_on
  `;
}

export async function clearSchedule(campaignId: string) {
  await ensureTable();
  await sql`DELETE FROM campaign_schedules WHERE campaign_id = ${campaignId}`;
}

// Campaign IDs whose send date is today or earlier (Taipei). Earlier dates are included so a
// missed cron run (Vercel outage, etc.) sends the issue on the next run instead of never.
export async function getDueCampaignIds(todayTaipei: string): Promise<string[]> {
  await ensureTable();
  const rows = await sql`
    SELECT campaign_id FROM campaign_schedules WHERE send_on <= ${todayTaipei} ORDER BY send_on, created_at
  `;
  return rows.map((r) => r.campaign_id as string);
}
