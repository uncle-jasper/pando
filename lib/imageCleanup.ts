import { eq } from "drizzle-orm";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { campaigns, templates, images } from "@/lib/schema";

const IMAGE_URL_PATTERN = /!\[[^\]]*\]\(([^)\s]+)\)/g;

export function extractImageUrls(markdownBody: string, heroImageUrl: string | null): string[] {
  const urls = new Set<string>();
  if (heroImageUrl) urls.add(heroImageUrl);
  for (const match of markdownBody.matchAll(IMAGE_URL_PATTERN)) {
    urls.add(match[1]);
  }
  return [...urls];
}

// Deletes any of the given URLs from Blob storage + the images table, but only if no other
// campaign or template still references them — the same uploaded image can be reused across
// multiple drafts/templates, so this only ever removes images nothing else points to anymore.
export async function deleteOrphanedImages(urls: string[], excludeCampaignId?: string): Promise<void> {
  if (urls.length === 0) return;

  const [allCampaigns, allTemplates] = await Promise.all([
    db.select({
      id: campaigns.id,
      markdownBody: campaigns.markdownBody,
      heroImageUrl: campaigns.heroImageUrl,
    }).from(campaigns),
    db.select({
      markdownBody: templates.markdownBody,
      heroImageUrl: templates.heroImageUrl,
    }).from(templates),
  ]);

  const stillReferenced = new Set<string>();
  for (const row of allCampaigns) {
    if (row.id === excludeCampaignId) continue;
    for (const url of extractImageUrls(row.markdownBody, row.heroImageUrl)) {
      stillReferenced.add(url);
    }
  }
  for (const row of allTemplates) {
    for (const url of extractImageUrls(row.markdownBody, row.heroImageUrl)) {
      stillReferenced.add(url);
    }
  }

  const orphaned = urls.filter((url) => !stillReferenced.has(url));
  for (const url of orphaned) {
    const [row] = await db.select().from(images).where(eq(images.url, url));
    if (!row) continue;
    await del(url).catch(() => {});
    await db.delete(images).where(eq(images.id, row.id));
  }
}
