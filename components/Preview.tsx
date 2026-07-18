"use client";

import { useMemo } from "react";
import { parseMarkdown } from "@/lib/markdown/parse";

interface PreviewProps {
  markdown: string;
  heroImageUrl?: string;
  heroImageAlt?: string;
}

export default function Preview({ markdown, heroImageUrl, heroImageAlt }: PreviewProps) {
  const html = useMemo(() => parseMarkdown(markdown), [markdown]);

  return (
    <div className="pando-preview">
      {heroImageUrl && (
        <img src={heroImageUrl} alt={heroImageAlt || ""} className="hero-image" />
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
