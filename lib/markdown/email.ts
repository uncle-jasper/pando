// Second render path for the same source markdown, adapted from lib/markdown/parse.ts
// (itself forked from tree) for email rendering, which differs from the browser preview
// in ways tree never had to handle:
//   - no data-source-line attributes (they exist only for the editor's scroll-sync)
//   - images must be absolute https URLs (relative URLs break in inboxes) and get
//     explicit block/border/max-width styling for email-client safety
//   - footnotes render as plain numbered endnotes, not in-page anchor jumps (unreliable
//     across mail clients)
//   - the gallery block renders as an HTML table grid instead of CSS grid/flexbox
//     (unsupported in most email clients)
// The actual inlining of these styles into `style="..."` attributes happens later via
// juice in lib/email.ts — this module just needs to emit HTML with a <style> block
// juice can read, matching tree's original approach of a stylesheet-driven #preview.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripAnnotations(text: string): string {
  return text.replace(/%\{[^}]*\}/g, "");
}

function isAbsoluteHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

function parseInlineEmail(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
      if (!isAbsoluteHttpsUrl(src)) return ""; // drop images we can't safely serve to an inbox
      return `<img src="${src}" alt="${alt}" class="email-img">`;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, href) => {
      if (!isAbsoluteHttpsUrl(href)) return text; // drop the link, keep the text
      return `<a href="${href}" class="email-link">${text}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\[\^([^\]]+)\]/g, (_, label) => `<sup>${label}</sup>`);
}

function parseGalleryTable(lines: string[], startIdx: number): { html: string; nextIdx: number } | null {
  if (lines[startIdx].trim() !== ":::gallery") return null;
  const images: { alt: string; src: string }[] = [];
  let i = startIdx + 1;
  while (i < lines.length && lines[i].trim() !== ":::") {
    const m = lines[i].match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (m && isAbsoluteHttpsUrl(m[2])) images.push({ alt: m[1], src: m[2] });
    i++;
  }

  const cols = images.length >= 3 ? 3 : Math.max(images.length, 1);
  const rows: (typeof images)[] = [];
  for (let r = 0; r < images.length; r += cols) rows.push(images.slice(r, r + cols));

  const cellWidth = Math.floor(100 / cols);
  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (img) =>
              `<td class="gallery-cell" width="${cellWidth}%"><img src="${escapeHtml(img.src)}" alt="${escapeHtml(
                img.alt
              )}" class="gallery-img">${img.alt ? `<div class="gallery-caption">${escapeHtml(img.alt)}</div>` : ""}</td>`
          )
          .join("")}</tr>`
    )
    .join("");

  return {
    html: `<table role="presentation" class="gallery-table" width="100%" cellpadding="0" cellspacing="0"><tbody>${rowsHtml}</tbody></table>\n`,
    nextIdx: i + 1,
  };
}

export function renderEmailBody(md: string): string {
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
    const line = lines[i];

    const gallery = parseGalleryTable(lines, i);
    if (gallery) {
      html += gallery.html;
      i = gallery.nextIdx;
      continue;
    }

    if (line.startsWith("```")) {
      let code = "";
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code += lines[i] + "\n";
        i++;
      }
      html += `<pre class="email-pre"><code>${escapeHtml(code.trim())}</code></pre>\n`;
      i++;
      continue;
    }

    const hMatch = line.match(/^(#{1,6})(?:\s+(.+?))?\s*$/);
    if (hMatch) {
      const level = hMatch[1].length;
      html += `<h${level} class="email-h${level}">${parseInlineEmail(hMatch[2] || "")}</h${level}>\n`;
      i++;
      continue;
    }

    if (/^---+$/.test(line)) {
      html += `<hr class="email-hr">\n`;
      i++;
      continue;
    }

    if (line.startsWith("> ")) {
      html += `<blockquote class="email-blockquote">${parseInlineEmail(line.slice(2))}</blockquote>\n`;
      i++;
      continue;
    }

    if (/^[-*+] /.test(line) || /^\d+\. /.test(line)) {
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
        if (m) items += `<li>${parseInlineEmail(m[1])}</li>`;
        i++;
      }
      html += `<${tag} class="email-list">${items}</${tag}>\n`;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (l.trim() === "") break;
      if (/^#{1,6} /.test(l)) break;
      if (l.startsWith("```")) break;
      if (l.startsWith("> ")) break;
      if (/^[-*] /.test(l) || /^\d+\. /.test(l)) break;
      if (/^---+$/.test(l)) break;
      if (/^\[\^[^\]]+\]:/.test(l)) break;
      if (l.trim() === ":::gallery" || l.trim() === ":::") break;
      paraLines.push(l);
      i++;
    }
    if (paraLines.length > 0) {
      html += `<p class="email-p">${parseInlineEmail(paraLines.join(" "))}</p>\n`;
    } else {
      i++;
    }
  }

  if (footnoteOrder.length > 0) {
    html += '<div class="email-footnotes">';
    footnoteOrder.forEach((label, idx) => {
      html += `<p class="email-footnote">${idx + 1}. ${parseInlineEmail(footnoteMap.get(label)!)}</p>`;
    });
    html += "</div>\n";
  }

  return html;
}
