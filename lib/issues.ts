import { desc, eq, ne } from "drizzle-orm";
import { db } from "./db";
import { campaigns } from "./schema";
import { deriveTitle, parseMarkdown } from "./markdown/parse";
import { getImageDimensions, type ImageDimensions } from "./imageDimensions";

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
  draft?: boolean; // only ever true in preview mode (see getSentIssues' includeDrafts)
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

// Web layout for ":::gallery" blocks, matching the email (lib/markdown/email.ts): two photos per
// row, each row's photos sized by their real aspect ratios so they share one height with no
// cropping (flex-basis 0 + flex-grow = ratio splits the row width in proportion to the ratios,
// which makes the heights equal). A lone last photo sits centered, sized to roughly match the
// row above (same 50–100% clamp as the email). Galleries with any photo of unknown size keep
// parse.ts's cropped-square fallback (.gallery--cropped), styled by the WordPress plugin.
export function webGalleries(html: string): string {
  return html.replace(
    /<div class="gallery gallery--justified"[^>]*>([\s\S]*?<\/figure>)<\/div>/g,
    (_m, inner: string) => {
      const figs = [...inner.matchAll(/<figure class="gallery-item" style="flex-grow:([\d.]+);[^"]*">([\s\S]*?)<\/figure>/g)].map(
        (f) => ({ ratio: parseFloat(f[1]), body: f[2] })
      );
      const rows: (typeof figs)[] = [];
      for (let i = 0; i < figs.length; i += 2) rows.push(figs.slice(i, i + 2));
      const rowsHtml = rows
        .map((row, idx) => {
          const cells = row
            .map((f) => `<figure class="gallery-item" style="flex:${f.ratio.toFixed(4)} 1 0%">${f.body}</figure>`)
            .join("");
          let style = "";
          if (row.length === 1 && idx > 0) {
            const prevSum = rows[idx - 1].reduce((s, f) => s + f.ratio, 0);
            const pct = Math.max(50, Math.min(100, (row[0].ratio / prevSum) * 100));
            style = ` style="width:${pct.toFixed(2)}%;margin-left:auto;margin-right:auto"`;
          }
          return `<div class="gallery-row"${style}>${cells}</div>`;
        })
        .join("");
      return `<div class="gallery gallery--rows">${rowsHtml}</div>`;
    }
  );
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

function toDetail(row: Row, vol: number, origin: string, dimensions: ImageDimensions): IssueDetail {
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
    // The hero image (if one is set) leads the issue, as it does in the email.
    bodyHtml: cleanBodyHtml(
      (row.heroImageUrl && /^https:\/\//i.test(row.heroImageUrl)
        ? `<img class="hero-image" src="${row.heroImageUrl.replace(/"/g, "&quot;")}" alt="${(row.heroImageAlt || "").replace(/"/g, "&quot;")}">\n`
        : "") + webGalleries(parseMarkdown(md, dimensions))
    ),
  };
}

// All sent issues that carry a "Vol. NNN" line, newest volume first. If two campaigns claim the
// same volume, the most recently sent one wins.
// includeDrafts (preview mode only — verified X-Pando-Preview key, see lib/tokens.ts) also
// lists unsent issues, flagged draft: true. A sent issue always beats a draft of the same
// volume; among drafts, the most recently edited wins.
export async function getSentIssues(origin: string, includeDrafts = false): Promise<IssueDetail[]> {
  const sentRows = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.status, "sent"))
    .orderBy(desc(campaigns.sentAt));
  const draftRows = includeDrafts
    ? await db.select().from(campaigns).where(ne(campaigns.status, "sent")).orderBy(desc(campaigns.updatedAt))
    : [];
  const rows = [...sentRows, ...draftRows];
  const dimensions = rows.length ? await getImageDimensions() : {};
  const seen = new Set<number>();
  const out: IssueDetail[] = [];
  for (const row of rows) {
    const vol = parseVolume(row.markdownBody);
    if (vol === null || seen.has(vol)) continue;
    seen.add(vol);
    const detail = toDetail(row, vol, origin, dimensions);
    if (row.status !== "sent") detail.draft = true;
    out.push(detail);
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
