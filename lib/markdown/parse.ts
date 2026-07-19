// Forked from tree/index.html (escapeHtml/stripAnnotations/parseInline/parseMarkdown,
// originally lines 2691-2832). Core block/inline parsing logic is unchanged; adapted to
// TypeScript module exports. data-source-line attributes are kept for the browser preview
// (they're stripped by the email renderer, which has a different render target).

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function stripAnnotations(text: string): string {
  return text.replace(/%\{[^}]*\}/g, "");
}

// Pando addition (not in tree): a line ending in "\" forces a line break within a
// paragraph, without the blank-line gap a new paragraph would add. Uses a placeholder
// (safe from escapeHtml and every other parseInline regex) so it survives being parsed
// as part of the paragraph's text, then becomes a real <br> afterward.
const HARD_BREAK_TOKEN = "@@PANDO_BR@@";

function joinParagraphLines(paraLines: string[]): string {
  let raw = "";
  for (let idx = 0; idx < paraLines.length; idx++) {
    const line = paraLines[idx];
    const isLast = idx === paraLines.length - 1;
    const hardBreak = !isLast && /\\\s*$/.test(line);
    raw += hardBreak ? line.replace(/\\\s*$/, HARD_BREAK_TOKEN) : line;
    if (!isLast && !hardBreak) raw += " ";
  }
  return raw;
}

export function parseInline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(
      /\[\^([^\]]+)\]/g,
      (_, label) =>
        `<sup id="fnref-${label}"><a href="#fn-${label}" class="footnote-ref">${label}</a></sup>`
    );
}

interface GalleryImage {
  alt: string;
  src: string;
}

function parseGalleryBlock(lines: string[], startIdx: number): { html: string; nextIdx: number } | null {
  // Pando addition (not in tree): ":::gallery" fenced block containing image lines,
  // rendered by the browser preview with a real CSS grid (the email renderer emits an
  // HTML table grid instead — see lib/email.ts — because email clients don't support grid/flexbox).
  if (lines[startIdx].trim() !== ":::gallery") return null;
  const images: GalleryImage[] = [];
  let i = startIdx + 1;
  while (i < lines.length && lines[i].trim() !== ":::") {
    const m = lines[i].match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (m) images.push({ alt: m[1], src: m[2] });
    i++;
  }
  const items = images
    .map(
      (img) =>
        `<figure class="gallery-item"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt)}">${
          img.alt ? `<figcaption>${escapeHtml(img.alt)}</figcaption>` : ""
        }</figure>`
    )
    .join("");
  return { html: `<div class="gallery" data-count="${images.length}">${items}</div>\n`, nextIdx: i + 1 };
}

export function parseMarkdown(md: string): string {
  const footnoteMap = new Map<string, string>();
  const footnoteOrder: string[] = [];

  const stripped = stripAnnotations(md);

  const defRe = /^\[\^([^\]]+)\]:\s*(.*)/gm;
  let defM: RegExpExecArray | null;
  while ((defM = defRe.exec(stripped)) !== null) {
    const label = defM[1];
    const content = defM[2].trim();
    if (!footnoteMap.has(label)) {
      footnoteMap.set(label, content);
      footnoteOrder.push(label);
    }
  }

  const lines = stripped.replace(/^\[\^[^\]]+\]:\s*.*/gm, "").split("\n");
  let html = "";
  let i = 0;

  while (i < lines.length) {
    const lineNum = i + 1;
    const line = lines[i];

    const gallery = parseGalleryBlock(lines, i);
    if (gallery) {
      html += gallery.html;
      i = gallery.nextIdx;
      continue;
    }

    if (line.startsWith("```")) {
      const codeStart = lineNum;
      let code = "";
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code += lines[i] + "\n";
        i++;
      }
      html += `<pre data-source-line="${codeStart}"><code>${escapeHtml(code.trim())}</code></pre>\n`;
      i++;
      continue;
    }

    const hMatch = line.match(/^(#{1,6})(?:\s+(.+?))?\s*$/);
    if (hMatch) {
      const level = hMatch[1].length;
      html += `<h${level} data-source-line="${lineNum}">${parseInline(hMatch[2] || "")}</h${level}>\n`;
      i++;
      continue;
    }

    if (/^---+$/.test(line)) {
      html += `<hr data-source-line="${lineNum}">\n`;
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      html += `<blockquote data-source-line="${lineNum}">${parseInline(line.slice(2))}</blockquote>\n`;
      i++;
      continue;
    }

    // Pando addition (not in tree): "-# " prefix for a small, muted metadata line —
    // e.g. an issue number/date line at the top of a newsletter. Distinct from ">"
    // blockquotes, which render with a border and italics (a pull-quote look, not this).
    if (line.startsWith("-# ")) {
      html += `<p class="meta-text" data-source-line="${lineNum}">${parseInline(line.slice(3))}</p>\n`;
      i++;
      continue;
    }

    if (/^[-*+] /.test(line) || /^\d+\. /.test(line)) {
      const listStart = lineNum;
      const isOrdered = /^\d+\. /.test(line);
      const tag = isOrdered ? "ol" : "ul";
      let items = "";
      while (i < lines.length) {
        const l = lines[i];
        const lineOrdered = /^\d+\. /.test(l);
        const lineBullet = /^[-*+] /.test(l);
        if (!lineOrdered && !lineBullet) break;
        if (lineOrdered !== isOrdered) break;
        const m = l.match(/^[-*+] (.+)$/) || l.match(/^\d+\. (.+)$/);
        if (m) items += `<li>${parseInline(m[1])}</li>`;
        i++;
      }
      html += `<${tag} data-source-line="${listStart}">${items}</${tag}>\n`;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraStart = lineNum;
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^#{1,6} /.test(l)) break;
      if (l.startsWith("```")) break;
      if (l.startsWith("> ")) break;
      if (l.startsWith("-# ")) break;
      if (/^[-*] /.test(l) || /^\d+\. /.test(l)) break;
      if (/^---+$/.test(l)) break;
      if (/^\[\^[^\]]+\]:/.test(l)) break;
      if (l.trim() === ":::gallery" || l.trim() === ":::") break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      const parsed = parseInline(joinParagraphLines(paraLines)).split(HARD_BREAK_TOKEN).join("<br>");
      html += `<p data-source-line="${paraStart}">${parsed}</p>\n`;
    } else {
      i++;
    }
  }

  if (footnoteOrder.length > 0) {
    html += '<section class="footnotes"><ol>';
    for (const label of footnoteOrder) {
      html += `<li id="fn-${escapeHtml(label)}">${parseInline(footnoteMap.get(label)!)} <a href="#fnref-${escapeHtml(
        label
      )}" class="footnote-backref">↩</a></li>`;
    }
    html += "</ol></section>\n";
  }

  return html;
}

// Prefers the first markdown heading (any level); falls back to the first non-empty line
// (stripped of stray #'s) so a title always tracks the draft's actual content, matching
// tree's own sendToWordPress title-derivation behavior. Skips "-# " metadata lines (issue
// number/date, etc.) and "---" horizontal rules — neither is meant to become the title,
// and a metadata block is commonly followed by an hr separator before the real heading.
export function deriveTitle(markdown: string): string {
  for (const line of markdown.split("\n")) {
    if (line.startsWith("-# ")) continue;
    if (/^---+$/.test(line)) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) return heading[1].trim();
    if (line.trim()) return line.trim().replace(/^#+\s*/, "");
  }
  return "";
}
