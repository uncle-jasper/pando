import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { campaigns } from "./schema";
import { deriveTitle, parseMarkdown } from "./markdown/parse";

// Public archive of SENT issues, consumed by the danbenson.me WordPress plugin
// (see "Planned: newsletter archive" in CLAUDE.md). Drafts and in-progress sends are never
// exposed. No schema changes: the volume number is read from the issue's own "-# Vol. 001"
// masthead line, the date from its "-# YYYY-MM-DD" line, and the slug from the title.

export interface IssueSummary {
  vol: number;
  slug: string;
  title: string;
  subtitle: string | null;
  date: string; // YYYY-MM-DD
  excerpt: string;
  thumbnailUrl: string | null; // small (640px) version for list pages
  ogImageUrl: string | null; // 1200px version for link previews
}

export interface IssueDetail extends IssueSummary {
  bodyHtml: string;
}

export interface IssueLink {
  vol: number;
  slug: string;
  title: string;
}

export function parseVolume(markdown: string): number | null {
  const m = markdown.match(/^-#\s+Vol\.?\s*(\d+)\s*$/im);
  return m ? parseInt(m[1], 10) : null;
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "issue";
}

function firstImageUrl(markdown: string, heroImageUrl: string | null): string | null {
  const m = markdown.match(/!\[[^\]]*\]\((https:\/\/[^)\s]+)\)/);
  if (m) return m[1];
  return heroImageUrl && /^https:\/\//i.test(heroImageUrl) ? heroImageUrl : null;
}

// Served through Next's built-in image optimizer: no stored thumbnails, no schema change, and the
// small WebP/JPEG is cached on Vercel's CDN, so archive pages barely touch the Blob transfer limit.
function optimized(origin: string, src: string | null, width: number): string | null {
  if (!src) return null;
  return `${origin}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
}

function plainExcerpt(markdown: string): string {
  for (const raw of markdown.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    if (/^(-#|#|:::|!\[|---|>|\[\^)/.test(block)) continue;
    if (/^\*\*[^*]+\*\*$/.test(block)) continue; // bold-only subtitle line
    const text = block
      .replace(/\\\n/g, " ")
      .replace(/\s+/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`~]/g, "")
      .trim();
    if (!text) continue;
    if (text.length <= 160) return text;
    return text.slice(0, 160).replace(/\s+\S*$/, "") + "…";
  }
  return "";
}

function issueDate(markdown: string, sentAt: Date | null, updatedAt: Date): string {
  const m = markdown.match(/^-#\s+(\d{4}-\d{2}-\d{2})\s*$/m);
  if (m) return m[1];
  const d = sentAt ?? updatedAt;
  // Dan is in Taipei: use that calendar day, not UTC's.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function cleanBodyHtml(html: string): string {
  return html
    .replace(/ data-source-line="\d+"/g, "")
    .replace(/target="_blank"/g, 'target="_blank" rel="noopener"')
    // Lazy-load every image except the first (it's at the top of the page).
    .replace(/<img /g, (() => {
      let n = 0;
      return () => (n++ === 0 ? "<img " : '<img loading="lazy" decoding="async" ');
    })());
}

type Row = typeof campaigns.$inferSelect;

function toDetail(row: Row, vol: number, origin: string): IssueDetail {
  const md = row.markdownBody;
  const title = row.title || deriveTitle(md) || `Vol. ${vol}`;
  const src = firstImageUrl(md, row.heroImageUrl);
  const subtitleMatch = md.match(/^\*\*(.+)\*\*\s*$/m);
  return {
    vol,
    slug: slugify(title),
    title,
    subtitle: subtitleMatch ? subtitleMatch[1].trim() : null,
    date: issueDate(md, row.sentAt ? new Date(row.sentAt) : null, new Date(row.updatedAt)),
    excerpt: plainExcerpt(md),
    thumbnailUrl: optimized(origin, src, 640),
    ogImageUrl: optimized(origin, src, 1200),
    bodyHtml: cleanBodyHtml(parseMarkdown(md)),
  };
}

// All sent issues that carry a "Vol. NNN" line, newest volume first. If two campaigns claim the
// same volume, the most recently sent one wins.
export async function getSentIssues(origin: string): Promise<IssueDetail[]> {
  const rows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "sent"))
    .orderBy(desc(campaigns.sentAt));
  const seen = new Set<number>();
  const out: IssueDetail[] = [];
  for (const row of rows) {
    const vol = parseVolume(row.markdownBody);
    if (vol === null || seen.has(vol)) continue;
    seen.add(vol);
    out.push(toDetail(row, vol, origin));
  }
  return out.sort((a, b) => b.vol - a.vol);
}

export function summarize(issue: IssueDetail): IssueSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { bodyHtml, ...summary } = issue;
  return summary;
}

export function linkOf(issue: IssueDetail | undefined): IssueLink | null {
  return issue ? { vol: issue.vol, slug: issue.slug, title: issue.title } : null;
}

export function originFor(req: Request): string {
  return (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}
