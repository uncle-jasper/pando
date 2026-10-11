"use client";

import { useEffect, useMemo, useState } from "react";
import { parseMarkdown, type GalleryDimensions } from "@/lib/markdown/parse";

interface PreviewProps {
  markdown: string;
  heroImageUrl?: string;
  heroImageAlt?: string;
  // Real photo dimensions, keyed by URL, for any ":::gallery" blocks — see GalleryDimensions
  // in lib/markdown/parse.ts. The editor page fetches/maintains this; defaults to empty here
  // so every gallery just falls back to the cropped grid if the caller doesn't pass one.
  dimensions?: GalleryDimensions;
}

interface FooterSettings {
    footerTagline: string | null;
    fromName: string;
    physicalMailingAddress: string;
}

export default function Preview({ markdown, heroImageUrl, heroImageAlt, dimensions = {} }: PreviewProps) {
  const html = useMemo(() => parseMarkdown(markdown, dimensions), [markdown, dimensions]);
  const [footer, setFooter] = useState(null as FooterSettings | null);

  useEffect(() => {
    fetch("/api/admin/settings")
    .then((r) => r.json())
    .then((row: FooterSettings) => setFooter(row))
    .catch(() => {});
  }, []);

  const footerHtml = footer
  ? [footer.footerTagline || "", footer.physicalMailingAddress, `<span style="text-decoration: underline;">View in browser</span> &middot; <span style="text-decoration: underline;">Unsubscribe</span>`].filter(Boolean).join("<br>")
    : "";

  return (
    <div className="pando-preview">
      {heroImageUrl && (
        <img src={heroImageUrl} alt={heroImageAlt || ""} className="hero-image" />
      )}
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {footer && (
      <div
        style={{
          marginTop: "2.5rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          fontSize: "0.75rem",
          color: "var(--muted)",
          lineHeight: 1.6,
        }}
        dangerouslySetInnerHTML={{ __html: footerHtml }}
        />
      )}
    </div>
  );
}
