// Suggested photo count for an issue, scaled to its length.
// Baseline: issues 001 ("the wind") and 002 ("yongkang") together ran ~3,150 words
// with 26 photos (7 of them in two-photo galleries) — about 1 photo per 120 words
// and 1 gallery per 450 words. Change the constants below to re-tune.

export const WORDS_PER_PHOTO = 120;
export const WORDS_PER_GALLERY = 450;
export const MIN_PHOTOS = 4; // masthead, one in the body, one gallery pair... floor for short issues

const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;

export interface PhotoGuide {
  words: number;
  photos: number;
  galleries: number;
  suggestedPhotos: number;
  suggestedGalleriesMin: number;
  suggestedGalleriesMax: number;
}

export function countWords(markdown: string): number {
  const text = markdown
    .replace(IMAGE_RE, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text only
    .replace(/^-#.*$/gm, " ") // masthead / metadata lines
    .replace(/^:::.*$/gm, " ") // gallery / full-bleed fences
    .replace(/[#*_>`\\]/g, " ");
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function photoGuide(markdown: string, hasHeroImage = false): PhotoGuide {
  const words = countWords(markdown);
  const photos = (markdown.match(IMAGE_RE) || []).length + (hasHeroImage ? 1 : 0);
  const galleries = (markdown.match(/^:::gallery/gm) || []).length;
  const g = words / WORDS_PER_GALLERY;
  return {
    words,
    photos,
    galleries,
    suggestedPhotos: words === 0 ? 0 : Math.max(MIN_PHOTOS, Math.round(words / WORDS_PER_PHOTO)),
    suggestedGalleriesMin: Math.floor(g),
    suggestedGalleriesMax: Math.ceil(g),
  };
}
