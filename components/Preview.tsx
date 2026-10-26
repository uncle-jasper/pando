"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseMarkdown, type GalleryDimensions } from "@/lib/markdown/parse";
import { FOOTER_REASON } from "@/lib/footer";

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
  // data-source-line attributes are stripped here: nothing in Pando's preview uses them, and
  // because they renumber every block below an edit, they'd defeat the block-level diff below.
  const html = useMemo(
    () => parseMarkdown(markdown, dimensions).replace(/ data-source-line="\d+"/g, ""),
    [markdown, dimensions],
  );
  const bodyRef = useRef<HTMLDivElement>(null);

  // Patch the preview in place instead of replacing its whole innerHTML on every keystroke.
  // A full replace destroys and recreates every <img>, which briefly collapse to zero height
  // while they re-decode — that's what made the preview jump around while typing. Here only
  // the top-level blocks that actually changed get swapped; unchanged ones (and their images)
  // stay exactly where they are.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const next = Array.from(tpl.content.childNodes);
    const cur = Array.from(el.childNodes);
    let start = 0;
    while (start < cur.length && start < next.length && cur[start].isEqualNode(next[start])) start++;
    let endCur = cur.length - 1;
    let endNext = next.length - 1;
    while (endCur >= start && endNext >= start && cur[endCur].isEqualNode(next[endNext])) {
      endCur--;
      endNext--;
    }
    const anchor = cur[endCur + 1] ?? null;
    for (let i = start; i <= endCur; i++) el.removeChild(cur[i]);
    for (let i = start; i <= endNext; i++) el.insertBefore(next[i], anchor);
  }, [html]);
  const [footer, setFooter] = useState(null as FooterSettings | null);

  useEffect(() => {
    fetch("/api/admin/settings")
    .then((r) => r.json())
    .then((row: FooterSettings) => setFooter(row))
    .catch(() => {});
  }, []);

  const footerHtml = footer
    ? `${[footer.footerTagline || "", footer.physicalMailingAddress].filter(Boolean).join("<br>")}<div style="width:32px;border-top:1px solid var(--muted);margin:16px auto"></div>${FOOTER_REASON}<br><span style="text-decoration: underline;">${/^-#\s+Vol\.?\s*\d+\s*$/im.test(markdown) ? "Read on danbenson.me" : "View in browser"}</span> &middot; <span style="text-decoration: underline;">Unsubscribe</span>`
    : "";

  return (
    <div className="pando-preview">
      {heroImageUrl && (
        <img src={heroImageUrl} alt={heroImageAlt || ""} className="hero-image" />
      )}
      <div ref={bodyRef} />
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
