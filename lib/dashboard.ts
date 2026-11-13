import { count, desc, eq, gte, inArray, lt, and, sql } from "drizzle-orm";
import { db } from "./db";
import { campaigns, images, sends, subscribers } from "./schema";
import { SEND_BATCH_SIZE } from "./sendCampaign";
import { issueWebUrl, parseVolume } from "./issues";

// Free-tier ceilings the dashboard measures against. Keep in sync with the "Free-tier limits"
// section of CLAUDE.md; if a provider changes its limits, change them here.
const GB = 1024 * 1024 * 1024;
export const LIMITS = {
  resendDaily: 100, // Resend free plan: emails per day
  resendMonthly: 3000, // Resend free plan: emails per month
  blobStorageBytes: 1 * GB, // Vercel Blob (Hobby): storage
  blobTransferBytes: 10 * GB, // Vercel Blob (Hobby): data transfer per month (estimated, not measurable here)
  dbBytes: 1 * GB, // Neon free plan: storage per project
};

// Assumption behind the photo-transfer estimate: issues per month.
const ASSUMED_ISSUES_PER_MONTH = 1; // roughly monthly, per Dan (2026-11)

export interface IssueRow {
  id: string;
  vol: number | null;
  title: string;
  status: string;
  // When the first email went out (a big list can take several days on Resend's free plan).
  startedAt: string | null;
  // When the last batch finished; null while still sending.
  finishedAt: string | null;
  recipients: number;
  delivered: number;
  bounced: number;
  failed: number;
  unsubscribedWithin7Days: number | null;
  webUrl: string | null;
}

export type Level = "ok" | "watch" | "high";

export interface Gauge {
  key: string;
  label: string;
  used: number;
  limit: number;
  unit: "count" | "bytes";
  pct: number;
  level: Level;
  note?: string; // small explanatory line (e.g. that a figure is an estimate)
}

export interface DashboardStats {
  generatedAt: string;
  audience: {
    subscribed: number;
    pending: number;
    unsubscribed: number;
    bounced: number;
    complained: number;
    joinedLast30: number;
    leftLast30: number;
    weeklyJoins: number[]; // oldest -> newest, 12 weeks
    sources: { source: string; count: number }[];
  };
  lastIssue: null | {
    title: string;
    status: string;
    sentAt: string | null;
    recipients: number;
    delivered: number;
    bounced: number;
    failed: number;
    unsubscribedWithin7Days: number | null;
  };
  // Every sent (or still-sending) issue, newest first. No open/click tracking, by choice.
  issues: IssueRow[];
  gauges: Gauge[];
  daysToSendList: number;
  warnings: string[];
}

function levelFor(pct: number): Level {
  if (pct >= 90) return "high";
  if (pct >= 70) return "watch";
  return "ok";
}

function gauge(
  key: string,
  label: string,
  used: number,
  limit: number,
  unit: "count" | "bytes",
  note?: string
): Gauge {
  const pct = limit > 0 ? (used / limit) * 100 : 0;
  return { key, label, used, limit, unit, pct, level: levelFor(pct), note };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const days84 = new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000);
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

  // --- Audience -----------------------------------------------------------------------
  const statusRows = await db
    .select({ status: subscribers.status, n: count() })
    .from(subscribers)
    .groupBy(subscribers.status);
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = Number(r.n);

  const [joined] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(gte(subscribers.confirmedAt, days30));
  const [left] = await db
    .select({ n: count() })
    .from(subscribers)
    .where(gte(subscribers.unsubscribedAt, days30));

  const joinRows = await db
    .select({ at: subscribers.confirmedAt })
    .from(subscribers)
    .where(gte(subscribers.confirmedAt, days84));
  const weeklyJoins = new Array(12).fill(0) as number[];
  for (const r of joinRows) {
    if (!r.at) continue;
    const weeksAgo = Math.floor((now.getTime() - new Date(r.at).getTime()) / WEEK_MS);
    if (weeksAgo >= 0 && weeksAgo < 12) weeklyJoins[11 - weeksAgo] += 1;
  }

  const sourceRows = await db
    .select({ source: subscribers.source, n: count() })
    .from(subscribers)
    .where(eq(subscribers.status, "subscribed"))
    .groupBy(subscribers.source);
  const sources = sourceRows
    .map((r) => ({ source: r.source || "unknown", count: Number(r.n) }))
    .sort((a, b) => b.count - a.count);

  const subscribed = byStatus["subscribed"] ?? 0;

  // --- Sending volume (what Resend's free caps care about) ----------------------------------
  const countedStatuses = ["sent", "delivered", "bounced"] as const;
  const [sent24] = await db
    .select({ n: count() })
    .from(sends)
    .where(and(gte(sends.sentAt, dayAgo), inArray(sends.status, [...countedStatuses])));
  const [sent30] = await db
    .select({ n: count() })
    .from(sends)
    .where(and(gte(sends.sentAt, days30), inArray(sends.status, [...countedStatuses])));

  // --- Last issue ---------------------------------------------------------------------------
  const [last] = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.status, ["sent", "sending"]))
    .orderBy(desc(sql`coalesce(${campaigns.sentAt}, ${campaigns.updatedAt})`))
    .limit(1);

  let lastIssue: DashboardStats["lastIssue"] = null;
  if (last) {
    const sendRows = await db
      .select({ status: sends.status, n: count() })
      .from(sends)
      .where(eq(sends.campaignId, last.id))
      .groupBy(sends.status);
    const s: Record<string, number> = {};
    for (const r of sendRows) s[r.status] = Number(r.n);
    const recipients = Object.values(s).reduce((a, b) => a + b, 0);

    let unsubscribedWithin7Days: number | null = null;
    if (last.sentAt) {
      const end = new Date(new Date(last.sentAt).getTime() + WEEK_MS);
      const [u] = await db
        .select({ n: count() })
        .from(subscribers)
        .where(and(gte(subscribers.unsubscribedAt, last.sentAt), lt(subscribers.unsubscribedAt, end)));
      unsubscribedWithin7Days = Number(u.n);
    }

    lastIssue = {
      title: last.title || last.subject || "(untitled)",
      status: last.status,
      sentAt: last.sentAt ? new Date(last.sentAt).toISOString() : null,
      recipients,
      delivered: (s["sent"] ?? 0) + (s["delivered"] ?? 0),
      bounced: s["bounced"] ?? 0,
      failed: s["failed"] ?? 0,
      unsubscribedWithin7Days,
    };
  }

  // --- Issue history -------------------------------------------------------------------------
  const sentCampaigns = await db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.status, ["sent", "sending"]));
  const perCampaign = await db
    .select({
      campaignId: sends.campaignId,
      status: sends.status,
      n: count(),
      first: sql<string | null>`min(${sends.sentAt})`,
    })
    .from(sends)
    .groupBy(sends.campaignId, sends.status);
  const unsubTimes = (
    await db
      .select({ at: subscribers.unsubscribedAt })
      .from(subscribers)
      .where(sql`${subscribers.unsubscribedAt} is not null`)
  ).map((r) => new Date(r.at as Date).getTime());

  const issues: IssueRow[] = sentCampaigns.map((c) => {
    const counts: Record<string, number> = {};
    let first: number | null = null;
    for (const r of perCampaign) {
      if (r.campaignId !== c.id) continue;
      counts[r.status] = Number(r.n);
      if (r.first) {
        const t = new Date(r.first).getTime();
        if (first === null || t < first) first = t;
      }
    }
    const start = first ?? (c.sentAt ? new Date(c.sentAt).getTime() : null);
    let unsubs: number | null = null;
    if (start !== null) {
      unsubs = unsubTimes.filter((t) => t >= start && t < start + WEEK_MS).length;
    }
    return {
      id: c.id,
      vol: parseVolume(c.markdownBody),
      title: c.title || c.subject || "(untitled)",
      status: c.status,
      startedAt: start !== null ? new Date(start).toISOString() : null,
      finishedAt: c.status === "sent" && c.sentAt ? new Date(c.sentAt).toISOString() : null,
      recipients: Object.values(counts).reduce((a, b) => a + b, 0),
      delivered: (counts["sent"] ?? 0) + (counts["delivered"] ?? 0),
      bounced: counts["bounced"] ?? 0,
      failed: counts["failed"] ?? 0,
      unsubscribedWithin7Days: unsubs,
      webUrl: c.status === "sent" || c.status === "sending" ? issueWebUrl(c) : null,
    };
  });
  issues.sort((a, b) => (b.startedAt ?? "9999").localeCompare(a.startedAt ?? "9999"));

  // --- Storage ---------------------------------------------------------------------------------
  const [blob] = await db.select({ total: sql<string>`coalesce(sum(${images.size}), 0)` }).from(images);
  const blobBytes = Number(blob?.total ?? 0);

  let dbBytes: number | null = null;
  try {
    const res = await db.execute(sql`select pg_database_size(current_database()) as size`);
    const rows = (res as unknown as { rows?: { size: string | number }[] }).rows ?? (res as unknown as { size: string | number }[]);
    if (rows && rows[0]) dbBytes = Number(rows[0].size);
  } catch {
    dbBytes = null; // not fatal: the gauge is simply omitted
  }

  // --- Estimated photo transfer per issue ------------------------------------------------------------
  // Average photo weight per issue, multiplied by the list size — assumes every subscriber loads every
  // image once, which is realistic because Apple Mail preloads images for its users. The average comes
  // from the most recent sent issues (up to ESTIMATE_ISSUE_WINDOW), so it re-adjusts automatically after
  // every send. Before anything has been sent, it averages the drafts that have photos in them.
  const ESTIMATE_ISSUE_WINDOW = 6;
  let estimatePool = [...sentCampaigns].sort((a, b) =>
    String(b.sentAt ?? b.updatedAt).localeCompare(String(a.sentAt ?? a.updatedAt))
  );
  const estimateFromSent = estimatePool.length > 0;
  if (!estimateFromSent) estimatePool = await db.select().from(campaigns);
  const imageUrlsOf = (c: typeof campaigns.$inferSelect) =>
    Array.from(new Set(`${c.markdownBody}\n${c.heroImageUrl ?? ""}`.match(/https:\/\/[^\s)"']+/g) ?? []));
  const allEstimateUrls = Array.from(new Set(estimatePool.flatMap(imageUrlsOf)));
  const sizeByUrl = new Map<string, number>();
  if (allEstimateUrls.length > 0) {
    const rows = await db.select({ url: images.url, size: images.size }).from(images).where(inArray(images.url, allEstimateUrls));
    for (const r of rows) sizeByUrl.set(r.url, r.size);
  }
  const issueWeights = estimatePool
    .map((c) => imageUrlsOf(c).reduce((a, u) => a + (sizeByUrl.get(u) ?? 0), 0))
    .filter((w) => w > 0)
    .slice(0, ESTIMATE_ISSUE_WINDOW);
  const issueImageBytes = issueWeights.length
    ? Math.round(issueWeights.reduce((a, b) => a + b, 0) / issueWeights.length)
    : 0;
  const estimateBasis = issueWeights.length === 0
    ? "no photos yet"
    : estimateFromSent
      ? `average of the last ${issueWeights.length} sent issue${issueWeights.length === 1 ? "" : "s"}`
      : `average of ${issueWeights.length} draft${issueWeights.length === 1 ? "" : "s"}, until an issue is sent`;
  const estimatedMonthlyTransfer = issueImageBytes * subscribed * ASSUMED_ISSUES_PER_MONTH;

  // --- Gauges ----------------------------------------------------------------------------------------
  const gauges: Gauge[] = [
    gauge("resend-day", "Emails sent, last 24 hours", Number(sent24.n), LIMITS.resendDaily, "count", "Resend free plan: 100 a day."),
    gauge("resend-month", "Emails sent, last 30 days", Number(sent30.n), LIMITS.resendMonthly, "count", "Resend free plan: 3,000 a month. Test sends and signup confirmations aren't counted here, so this runs slightly low."),
    gauge("blob-storage", "Photo storage", blobBytes, LIMITS.blobStorageBytes, "bytes", "Vercel Blob free tier: 1 GB."),
    gauge(
      "blob-transfer",
      "Photo transfer (estimate)",
      estimatedMonthlyTransfer,
      LIMITS.blobTransferBytes,
      "bytes",
      `Estimate only: ${formatBytes(issueImageBytes)} of photos per issue (${estimateBasis}) × ${subscribed} subscribers × ${ASSUMED_ISSUES_PER_MONTH} issue${ASSUMED_ISSUES_PER_MONTH === 1 ? "" : "s"} a month. Vercel free tier: 10 GB a month. Real usage is on Vercel's usage page.`
    ),
  ];
  if (dbBytes !== null) {
    gauges.push(gauge("db", "Database size", dbBytes, LIMITS.dbBytes, "bytes", "Neon free plan: 1 GB."));
  }

  const daysToSendList = Math.max(1, Math.ceil(subscribed / SEND_BATCH_SIZE));

  // --- Warnings (what to do) -------------------------------------------------------------------------
  const warnings: string[] = [];
  if (subscribed > SEND_BATCH_SIZE) {
    warnings.push(
      `Your list (${subscribed}) is bigger than one day of free sending (${SEND_BATCH_SIZE}), so an issue now takes about ${daysToSendList} days to finish. Resend Pro ($20/mo) removes the daily cap; then raise SEND_BATCH_SIZE in lib/sendCampaign.ts.`
    );
  }
  for (const g of gauges) {
    if (g.level === "ok") continue;
    const tail =
      g.key === "blob-storage" || g.key === "blob-transfer"
        ? "If Vercel Blob passes its limit, photos stop loading in every email and archive page until the next 30-day cycle. Plan the move to Vercel Pro ($20/mo) or a cheaper image host before then."
        : g.key.startsWith("resend")
        ? "Resend Pro ($20/mo) lifts the daily cap and raises the monthly one to 50,000."
        : "Neon's paid plan is pay-as-you-go, usually a few dollars a month.";
    warnings.push(`${g.label}: ${Math.round(g.pct)}% of the free limit. ${tail}`);
  }
  const volCheck =
    last ?? (await db.select().from(campaigns).orderBy(desc(campaigns.updatedAt)).limit(1))[0];
  if (volCheck && parseVolume(volCheck.markdownBody) === null) {
    warnings.push(
      `${last ? "The last issue" : "The latest draft"} has no "-# Vol. NNN" line, so it won't appear in the website archive. Add one (for example "-# Vol. 002") to the masthead.`
    );
  }
  const bad = (byStatus["bounced"] ?? 0) + (byStatus["complained"] ?? 0);
  if (bad > 0 && subscribed > 0 && bad / (subscribed + bad) > 0.02) {
    warnings.push(
      `${bad} subscribers have bounced or complained (over 2% of your list). That can hurt deliverability; check the Subscribers tab.`
    );
  }

  return {
    generatedAt: now.toISOString(),
    audience: {
      subscribed,
      pending: byStatus["pending"] ?? 0,
      unsubscribed: byStatus["unsubscribed"] ?? 0,
      bounced: byStatus["bounced"] ?? 0,
      complained: byStatus["complained"] ?? 0,
      joinedLast30: Number(joined.n),
      leftLast30: Number(left.n),
      weeklyJoins,
      sources,
    },
    lastIssue,
    issues,
    gauges,
    daysToSendList,
    warnings,
  };
}
