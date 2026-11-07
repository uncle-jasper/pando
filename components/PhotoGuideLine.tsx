"use client";

import { useMemo } from "react";
import { photoGuide, WORDS_PER_PHOTO, WORDS_PER_GALLERY } from "@/lib/photoGuide";

// Small muted line in the campaign editor: word count + suggested photos/galleries
// for this length, against what's currently in the draft.
export default function PhotoGuideLine({ markdown, hasHeroImage }: { markdown: string; hasHeroImage: boolean }) {
  const g = useMemo(() => photoGuide(markdown, hasHeroImage), [markdown, hasHeroImage]);
  if (g.words === 0) return null;

  const galleryTarget =
    g.suggestedGalleriesMin === g.suggestedGalleriesMax
      ? `${g.suggestedGalleriesMin}`
      : `${g.suggestedGalleriesMin}–${g.suggestedGalleriesMax}`;

  return (
    <span
      className="text-xs text-[var(--muted)] whitespace-nowrap"
      title={`Rough guide only. About 1 photo per ${WORDS_PER_PHOTO} words and 1 gallery per ${WORDS_PER_GALLERY} words, based on issues 001 and 002.`}
    >
      {g.words.toLocaleString()} words · {g.photos} photos (~{g.suggestedPhotos} suggested) · {g.galleries} galleries ({galleryTarget} suggested)
    </span>
  );
}
