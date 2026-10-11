import { db } from "./db";
import { images } from "./schema";

// Keyed by the image's Blob URL (the same string a ":::gallery" block's `![alt](url)` lines
// reference) so the gallery renderers can look an image's real aspect ratio up without
// threading IDs through markdown. Images uploaded before the width/height columns existed,
// or any external URL typed directly into the markdown, simply won't have an entry — callers
// treat a missing entry as "unknown" and fall back to the cropped grid layout.
export type ImageDimensions = Record<string, { width: number; height: number }>;

export async function getImageDimensions(): Promise<ImageDimensions> {
  const rows = await db.select({ url: images.url, width: images.width, height: images.height }).from(images);
  const map: ImageDimensions = {};
  for (const row of rows) {
    if (row.width && row.height) map[row.url] = { width: row.width, height: row.height };
  }
  return map;
}
